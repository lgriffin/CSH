// The A3 of an analysis (The analysis A3 and 1.0, sections 1 to 3; stages 77 and 78): causes, places, the vital few,
// countermeasures, the goal, and the three renderings. F227 holds one end to end.
import { describe, expect, it } from "vitest";
import type { Analysis, OverviewEntry } from "@csh/check";
import { analysisSheet, causeOf, placeOf, renderSheetHtml, renderSheetMarkdown, renderStartHere, sheetFiles } from "../src/index.ts";

let n = 0;
const entry = (outcome: OverviewEntry["outcome"], kind: string, subject: string, extra: Partial<OverviewEntry> = {}): OverviewEntry => ({ outcome, kind, practice: "docs", subject, next: `close ${kind}`, anchor: `a${String(n++).padStart(15, "0")}`, ...extra });

function analysis(entries: OverviewEntry[], languages?: Analysis["languages"]): Analysis {
  const count = (o: string) => entries.filter((e) => e.outcome === o).length;
  return {
    schema: "csh-analysis/v1",
    subject: { path: "/x/ledger", repo: "https://example.invalid/acme/ledger.git", commit: "0123456789abcdef0123456789abcdef01234567" },
    profile: { kind: "proposed" },
    guesses: ["one"],
    told: [],
    ...(languages !== undefined ? { languages } : {}),
    overview: { schema: "csh-overview/v1", counts: { converged: count("converged"), gap: count("gap"), indeterminate: count("indeterminate") }, danger: { refuted: entries.filter((e) => e.danger?.structure === "refuted").length, masked: 0 }, entries },
  };
}

const refuted = { structure: "refuted" as const, shape: "code-refutes-prose" as const, of: "x", close: "Correct the statement" };

describe("placeOf", () => {
  it("places a path at its directory, to two levels; a root file at itself; an identifier at its source", () => {
    expect(placeOf("Documents/README.md#L7")).toBe("README.md");
    expect(placeOf("Documents/README.md")).toBe("README.md");
    expect(placeOf("Documents/guides/specs/a.md#L30")).toBe("guides/specs");
    expect(placeOf("Outputs/tsc/testdata/tests/cases/compiler/x")).toBe("tsc/testdata");
    expect(placeOf("Requirements/LED-2")).toBe("Requirements");
    expect(placeOf("Tests")).toBe("Tests");
  });
});

describe("causeOf", () => {
  it("names each kind's cause, and every other kind's as what CSH could not decide", () => {
    expect(causeOf("dangling-reference")).toBe("Prose has drifted from the code");
    expect(causeOf("unverified")).toBe("Claims nothing checks");
    expect(causeOf("unaccepted-case")).toBe("Test outputs out of step with their cases");
    expect(causeOf("no-results")).toBe("What CSH could not read or decide");
  });
});

describe("analysisSheet", () => {
  const es = [
    ...Array.from({ length: 6 }, (_, i) => entry("gap", "unverified", `Requirements/R-${i}`)),
    ...Array.from({ length: 3 }, (_, i) => entry("gap", "dangling-reference", `Documents/docs/a${i}.md`)),
    entry("gap", "dangling-reference", "Documents/docs/b.md", { danger: refuted }),
    entry("indeterminate", "no-results", "Tests"),
    entry("converged", "tested", "Requirements/R-9"),
  ];
  const s = analysisSheet(analysis(es));

  it("counts causes largest first, vital up to the first that reaches 80%", () => {
    expect(s.pareto.map((p) => [p.cause, p.count, p.vital])).toEqual([
      ["Claims nothing checks", 6, true],
      ["Prose has drifted from the code", 4, true],
      ["What CSH could not read or decide", 1, false],
    ]);
    expect(s.pareto[1]!.cumulative).toBe(0.909);
    expect(s.causes.map((c) => c.cause)).toEqual(["Claims nothing checks", "Prose has drifted from the code"]);
  });

  it("puts danger first, apart from the rest of its kind and place, then by what each clears", () => {
    expect(s.countermeasures.map((c) => [c.id, c.kind, c.place, c.clears, c.danger])).toEqual([
      ["C1", "dangling-reference", "docs", 1, true],
      ["C2", "unverified", "Requirements", 6, false],
      ["C3", "dangling-reference", "docs", 3, false],
      ["C4", "no-results", "Tests", 1, false],
    ]);
    expect(s.countermeasures[0]!.action).toBe("Correct the statement");
    expect(s.countermeasures[1]!.anchors).toHaveLength(5);
  });

  it("proposes a goal, and says the problem with its denominators", () => {
    expect(s.goal).toEqual([
      "Close the 1 danger entry: each is a statement the code refutes, or a check that cannot fail.",
      'Halve "Claims nothing checks": from 6 to 3 or fewer.',
      "Decide or justify the 1 indeterminate result.",
    ]);
    expect(s.problem).toBe("ledger has 10 gaps and 1 result CSH could not decide, against 1 converged. 1 of them is danger: a statement the code refutes, or a check that cannot fail. 2 causes account for 10 of the 11.");
  });

  it("lists ten countermeasures and counts the rest", () => {
    const many = analysisSheet(analysis(Array.from({ length: 12 }, (_, i) => entry("gap", "unverified", `Documents/d${i}/x/a.md`))));
    expect(many.countermeasures).toHaveLength(10);
    expect(many.more).toEqual({ countermeasures: 2, results: 2 });
  });

  it("marks experimental code, and names the languages", () => {
    const x = analysisSheet(analysis([entry("gap", "fact-conflict", "Code/src/main/App.java")], [{ language: "java", files: 3, status: "experimental" }, { language: "typescript", files: 9, status: "supported" }]));
    expect(x.countermeasures[0]!.experimental).toBe(true);
    expect(x.background.experimental).toEqual(["Java"]);
    expect(renderSheetMarkdown(x)).toContain("**Experimental:** Java is read by experimental readers");
  });

  it("says what an empty sheet means", () => {
    const none = analysisSheet(analysis([entry("converged", "tested", "Requirements/R-1")]));
    expect(none.goal).toEqual(["Nothing to close: every result converged. Keep it so with csh analyse --expected in CI."]);
    expect(renderSheetMarkdown(none)).toContain("No gaps and nothing undecided: every result converged.");
    expect(renderStartHere(none, "reports/csh-a3.html")).toBe("A3: reports/csh-a3.html. Nothing to close: every result converged.\n");
  });
});

describe("renderings", () => {
  const s = analysisSheet(analysis([entry("gap", "dangling-reference", "Documents/README.md", { danger: refuted, detail: "names what does not exist: README.md:4 mentions-file docs/design.md" }), entry("gap", "unverified", "Requirements/R-1")]));

  it("ends csh analyse with where to start", () => {
    expect(renderStartHere(s, "reports/csh-a3.html")).toBe([
      "== Start here: the 2 countermeasures the A3 proposes (reports/csh-a3.html)",
      "  C1  Correct the statement. [danger]",
      "        README.md: clears 1 of 2, dangling-reference (a reference to something that does not exist); e.g. README.md:4 mentions-file docs/design.md",
      "  C2  close unverified.",
      "        Requirements: clears 1 of 2, unverified (a requirement or rule nothing checks); e.g. Requirements/R-1",
      "",
    ].join("\n"));
  });

  it("writes Markdown with seven numbered blocks and links into the analysis", () => {
    const md = renderSheetMarkdown(s);
    expect([...md.matchAll(/^## (\d)\. /gm)].map((m) => m[1])).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(md).toContain(`(csh-analysis.html#${s.countermeasures[0]!.anchors[0]})`);
    expect(md).toContain("- [ ] **C1**");
  });

  it("writes one self-contained page that prints on A3", () => {
    const html = renderSheetHtml(s);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("@page{size:A3 landscape");
    expect(html).not.toMatch(/<script|<link /);
    expect(Object.keys(sheetFiles(s))).toEqual(["csh-a3.json", "csh-a3.md", "csh-a3.html"]);
    expect(JSON.parse(sheetFiles(s)["csh-a3.json"]).schema).toBe("csh-analysis-a3/v1");
  });
});
