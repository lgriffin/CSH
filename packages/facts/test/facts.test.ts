import { describe, expect, it } from "vitest";
import { formatFacts, parseFacts, readFactFiles, validateFact } from "../src/index.ts";

const base = { schema: "csh-facts/v1" as const, subject: { commit: "c" }, tool: { id: "t", version: "1" } };

describe("the fact format", () => {
  it("round-trips through format and parse", () => {
    const facts = [
      { ...base, kind: "package" as const, name: "a", at: "a/package.json" },
      { ...base, kind: "depends" as const, from: "a", to: "b", via: "import" as const, typeOnly: true, at: "a/src/x.ts:1" },
      { ...base, kind: "skipped" as const, from: "a", reason: "dynamic import of a computed specifier", at: "a/src/y.ts:4" },
    ];
    expect(parseFacts(formatFacts(facts))).toEqual({ facts: facts.map((fact, i) => ({ fact, line: i + 1 })), problems: [] });
  });

  it("reports a malformed line and keeps the rest", () => {
    expect(validateFact({ ...base, kind: "depends", from: "a", to: "b", via: "pipe", typeOnly: false, at: "x" })).toMatch(/via/);
    const out = readFactFiles({ source: { name: "Code", kind: "Facts", at: "f" }, vocabulary: { units: [], enums: [], states: [], events: [] }, bindings: [], files: [{ path: "f.ndjson", digest: "d", bytes: new TextEncoder().encode(`not json\n${JSON.stringify({ ...base, kind: "package", name: "a", at: "p" })}\n`) }] });
    expect(out.facts).toHaveLength(1);
    expect(out.diagnostics).toEqual([expect.objectContaining({ code: "malformed-fact", span: "f.ndjson:1" })]);
  });
});
