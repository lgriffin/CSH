// Expected results (Ingesting a codebase, stage 28): a profile's committed expectations, checked against the overview.
import { describe, expect, it } from "vitest";
import { checkExpected, CONVERGED_NEXT, GAP_NEXT, type Overview, parseExpected, renderExpect } from "../src/index.ts";

const overview: Overview = {
  schema: "csh-overview/v1",
  counts: { gap: 2, indeterminate: 0, converged: 1 },
  danger: { refuted: 0, masked: 0 },
  entries: [
    { outcome: "gap", kind: "stale-prose", practice: "charter", subject: "Charter/doc.md", detail: "doc.md:89 names a.ts, changed in 1 commit since the line; doc.md:896 names b.ts, changed", next: "", anchor: "a" },
    { outcome: "gap", kind: "fact-conflict", practice: "specification", subject: "S/Claims/NodeFloor", next: "", anchor: "b" },
    { outcome: "converged", kind: "justified-gap", practice: "security", subject: "Security/P10", next: "", anchor: "c" },
  ],
};

describe("expected results", () => {
  it("places a justified gap among the converged, never among the gaps", () => {
    expect(CONVERGED_NEXT["justified-gap"]).toBeDefined();
    expect(GAP_NEXT["justified-gap"]).toBeUndefined();
  });

  it("meets each expectation by outcome, kind, subject and a span the detail holds, and counts what is unknown", () => {
    const parsed = parseExpected(
      JSON.stringify({
        schema: "csh-expected/v1",
        counts: { gap: 2, converged: 1 },
        rows: [
          { row: 1, title: "a stale line", expect: [{ outcome: "gap", kind: "stale-prose", subject: "Charter/doc.md", at: "doc.md:89" }] },
          { row: 2, title: "a refuted claim, and a count no fact holds", expect: [{ outcome: "gap", kind: "fact-conflict", subject: "S/Claims/NodeFloor" }], unknown: [{ what: "a count", reason: "no fact holds it" }] },
          { row: 3, title: "only unknown", expect: [], unknown: [{ what: "x", reason: "y" }] },
          { row: 4, title: "a recorded silence", expect: [{ outcome: "converged", kind: "justified-gap", subject: "Security/P10" }] },
        ],
      }),
    );
    expect(parsed.problems).toEqual([]);
    const r = checkExpected(overview, parsed.expected!);
    expect(r.mismatches).toEqual([]);
    expect(r.rows.map((x) => x.status)).toEqual(["reported", "partly-unknown", "unknown", "reported"]);
    expect(renderExpect(r)).toContain("every expectation met");
  });

  it("reports each expectation not met, a span that only prefixes another, a row with nothing, and counts that differ", () => {
    const r = checkExpected(overview, {
      schema: "csh-expected/v1",
      counts: { gap: 3 },
      rows: [
        { row: 1, title: "t", expect: [{ outcome: "gap", kind: "stale-prose", subject: "Charter/doc.md", at: "doc.md:8" }] },
        { row: 2, title: "t", expect: [{ outcome: "indeterminate", kind: "fact-conflict", subject: "S/Claims/NodeFloor" }] },
        { row: 3, title: "t", expect: [] },
      ],
    });
    expect(r.mismatches).toEqual([
      { row: 1, message: "no gap stale-prose for Charter/doc.md at doc.md:8" },
      { row: 2, message: "no indeterminate fact-conflict for S/Claims/NodeFloor" },
      { row: 3, message: "the row expects nothing and lists nothing unknown" },
      { message: "2 gap entries, expected 3" },
    ]);
    expect(r.rows.map((x) => x.status)).toEqual(["missing", "missing", "missing"]);
  });

  it("needs two entries for an expectation listed twice, while one entry meets two lines of itself", () => {
    const r = checkExpected(overview, {
      schema: "csh-expected/v1",
      counts: { gap: 2 },
      rows: [
        { row: 1, title: "t", expect: [{ outcome: "gap", kind: "fact-conflict", subject: "S/Claims/NodeFloor" }, { outcome: "gap", kind: "fact-conflict", subject: "S/Claims/NodeFloor" }] },
        { row: 2, title: "t", expect: [{ outcome: "gap", kind: "stale-prose", subject: "Charter/doc.md", at: "doc.md:89" }, { outcome: "gap", kind: "stale-prose", subject: "Charter/doc.md", at: "doc.md:896" }] },
      ],
    });
    expect(r.mismatches).toEqual([{ row: 1, message: "no gap fact-conflict for S/Claims/NodeFloor" }]);
    expect(r.rows.map((x) => x.status)).toEqual(["missing", "reported"]);
  });

  it("refuses a malformed expected file rather than expecting nothing", () => {
    expect(parseExpected("{").problems[0]).toMatch(/^not JSON/);
    expect(parseExpected('{"schema":"other"}').problems).toEqual(["not a csh-expected/v1 file with rows"]);
    expect(parseExpected('{"schema":"csh-expected/v1","rows":[{"row":1,"title":"t","expect":[{"kind":"k"}]}]}').problems).toEqual(["rows[0].expect[0] needs an outcome, a kind and a subject"]);
  });
});
