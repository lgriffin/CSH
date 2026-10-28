// Labelled results (The analysis A3 and 1.0, section 4; stage 79): precision by kind, and the gate.
import { describe, expect, it } from "vitest";
import { checkLabels, type Labels, type Overview, type OverviewEntry, parseLabels, renderLabels } from "../src/index.ts";

const entry = (outcome: OverviewEntry["outcome"], kind: string, subject: string, extra: Partial<OverviewEntry> = {}): OverviewEntry => ({ outcome, kind, practice: "docs", subject, next: "x", anchor: subject, ...extra });
const overview = (entries: OverviewEntry[]): Overview => ({ schema: "csh-overview/v1", counts: { converged: 0, gap: 0, indeterminate: 0 }, danger: { refuted: 0, masked: 0 }, entries });
const labels = (ls: Labels["labels"], commit = "c1"): Labels => ({ schema: "csh-labels/v1", subject: { repo: "r", commit }, labels: ls });
const refuted = { structure: "refuted" as const, shape: "code-refutes-prose" as const, of: "x", close: "Correct it" };

describe("checkLabels", () => {
  const o = overview([
    entry("gap", "unverified", "Documents/a.md#L1"),
    entry("gap", "unverified", "Documents/a.md#L2"),
    entry("gap", "dangling-reference", "Documents/b.md", { danger: refuted }),
    entry("indeterminate", "no-results", "Tests"),
    entry("converged", "tested", "Requirements/R-1"),
  ]);

  it("counts precision by kind over the open entries, and passes when every one is labelled", () => {
    const r = checkLabels(o, labels([
      { outcome: "gap", kind: "unverified", subject: "Documents/a.md#L1", label: true, why: "no test cites it" },
      { outcome: "gap", kind: "unverified", subject: "Documents/a.md#L2", label: false, why: "it names its lint rule" },
      { outcome: "gap", kind: "dangling-reference", subject: "Documents/b.md", label: true, why: "the file was deleted" },
      { outcome: "indeterminate", kind: "no-results", subject: "Tests", label: true, why: "no results file is committed" },
    ]), "c1");
    expect([r.open, r.true, r.false, r.mismatches]).toEqual([4, 3, 1, []]);
    expect(r.byKind).toEqual([{ kind: "unverified", true: 1, false: 1 }, { kind: "dangling-reference", true: 1, false: 0 }, { kind: "no-results", true: 1, false: 0 }]);
    expect(renderLabels(r)).toContain("Labels: 3 of 4 labelled open entries are true (75% precision), of 4 open");
  });

  it("fails on an unlabelled entry, a label that names none, a refuted entry labelled false and another commit", () => {
    const r = checkLabels(o, labels([
      { outcome: "gap", kind: "unverified", subject: "Documents/a.md#L1", label: true, why: "w" },
      { outcome: "gap", kind: "dangling-reference", subject: "Documents/b.md", label: false, why: "it is build output" },
      { outcome: "indeterminate", kind: "no-results", subject: "Tests", label: true, why: "w" },
      { outcome: "gap", kind: "unverified", subject: "Documents/gone.md#L9", label: true, why: "w" },
    ], "c0"), "c1");
    expect(r.mismatches).toEqual([
      "the labels judge c0, and the analysis read c1",
      "unlabelled: gap unverified Documents/a.md#L2",
      "refuted and labelled false: dangling-reference Documents/b.md (it is build output)",
      "a label names no entry: gap unverified Documents/gone.md#L9",
    ]);
  });
});

describe("parseLabels", () => {
  it("refuses a label with no why, or a converged outcome", () => {
    expect(parseLabels('{"schema":"csh-labels/v1","subject":{"repo":"r","commit":"c"},"labels":[{"outcome":"converged","kind":"k","subject":"s","label":true,"why":"w"}]}').problems).toHaveLength(1);
    expect(parseLabels('{"schema":"csh-labels/v1","subject":{"repo":"r","commit":"c"},"labels":[{"outcome":"gap","kind":"k","subject":"s","label":true,"why":" "}]}').problems).toHaveLength(1);
    expect(parseLabels("[]").problems).toEqual(["not a csh-labels/v1 file with a subject repo and commit and labels"]);
    for (const subject of [{ commit: "c" }, { repo: 1, commit: "c" }, { repo: "", commit: "c" }])
      expect(parseLabels(JSON.stringify({ schema: "csh-labels/v1", subject, labels: [] })).problems).toEqual(["not a csh-labels/v1 file with a subject repo and commit and labels"]);
    expect(parseLabels('{"schema":"csh-labels/v1","subject":{"repo":"r","commit":"c"},"labels":[]}').labels?.labels).toEqual([]);
  });
});
