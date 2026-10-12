// Claim findings shown as the sentence that holds the claim (From real runs, stage 46).
import { describe, expect, it } from "vitest";
import { claimEvidence, claimSpans, type Finding, lineHolding, lineStating, type SentenceAt } from "../src/index.ts";

const finding = (kind: Finding["kind"], reason: string): Finding => ({ id: "F", kind, scope: "specification", members: [], context: [], crossSource: false, collisionTerms: [], reason, query: "Q" });

describe("claim spans", () => {
  it("pairs each span with the values its claim states", () => {
    expect(claimSpans(finding("fact-conflict", "docs/a.md:3: says count of modules packages/* is 5; 7 are read"))).toEqual([{ span: "docs/a.md:3", values: ["5"] }]);
    expect(claimSpans(finding("claim-conflict", "docs/a.md:3: A and README.md:9: B: one says package.json engines.node is >=18, the other package.json engines.node is >=22.12"))).toEqual([
      { span: "docs/a.md:3", values: ["18"] },
      { span: "README.md:9", values: ["22.12"] },
    ]);
  });

  it("pairs a span with its own clause when only a later clause carries a span", () => {
    expect(claimSpans(finding("claim-conflict", "the root README and docs/b.md:4: B: one says engines.node is >=18, the other engines.node is >=22"))).toEqual([{ span: "docs/b.md:4", values: ["22"] }]);
  });

  it("takes no value from a glob, a path or a parenthesis", () => {
    expect(claimSpans(finding("fact-conflict", "docs/a.md:3: says count of modules packages/v2/* (from 2 globs) is 5; 7 are read"))).toEqual([{ span: "docs/a.md:3", values: ["5"] }]);
  });

  it("finds the line of a table or list that holds the value, and keeps the span's line otherwise", () => {
    const lines = ["## Packages", "", "| Package | Count |", "|---|---|", "| total | 15 |", "| published | 5 |", "", "There are 5 more."];
    expect(lineHolding(lines, 2, ["5"])).toBe(5);
    expect(lineHolding(lines, 2, ["1.5"])).toBe(2);
    expect(lineHolding(lines, 2, [])).toBe(2);
    // The block ends at a blank line: the paragraph after it is another sentence.
    expect(lineHolding(lines, 0, ["5"])).toBe(0);
  });

  it("finds a count written as a word, and not one as a word (stage 47)", () => {
    const lines = ["| Decision | Note |", "|---|---|", "| 13 | other row |", "| keep | thirteen mutants survive |"];
    expect(lineStating(["We keep thirteen mutants."], 0, ["13"])).toBe(0);
    expect(lineStating(lines, 0, ["13"])).toBe(2);
    expect(lineStating(["one of them"], 0, ["1"])).toBeUndefined();
    expect(lineStating(["## jsr/", "- a", "- b"], 0, ["5"])).toBeUndefined();
    // A version may be written without its trailing zeros, never with other digits dropped.
    expect(lineStating(["The floor is Node 18."], 0, ["18.0.0"])).toBe(0);
    expect(lineStating(["Pinned at 1.35."], 0, ["1.35.0"])).toBe(0);
    expect(lineStating(["Pinned at 1.3."], 0, ["1.35.0"])).toBeUndefined();
  });

  it("reads a conflict whose other claim is negated (stage 47)", () => {
    expect(claimSpans(finding("claim-conflict", "a.md:3: A and b.md:9: B: one says it is false that X extends Y, the other says X extends Y"))).toEqual([
      { span: "a.md:3", values: [] },
      { span: "b.md:9", values: [] },
    ]);
  });

  it("cites the shown line in the headline, and says when no line states the value (stage 47)", () => {
    const files: Record<string, string[]> = { "d.md": ["## Versions", "", "intro", "Pinned at 1.4.0."], "c.md": ["## jsr/", "- a", "- b"] };
    const at: SentenceAt = (span, values = []) => {
      const [file, n] = span.split(":");
      const lines = files[file!]!;
      const stating = lineStating(lines, Number(n) - 1, values);
      const i = stating ?? Number(n) - 1;
      return { at: `${file}:${i + 1}`, text: lines[i]!, stated: values.length === 0 || stating !== undefined };
    };
    const moved = claimEvidence(finding("fact-conflict", "d.md:3: says version of x is 1.4.0; 1.5.0 is read"), at);
    // The block from line 3 runs to line 4, which holds the version.
    expect(moved.reason).toBe("d.md:4: says version of x is 1.4.0; 1.5.0 is read");
    expect(moved.lines).toEqual(['d.md:4 says: "Pinned at 1.4.0."']);
    const counted = claimEvidence(finding("fact-conflict", "c.md:1: says count of modules jsr is 5; 2 are read"), at);
    expect(counted.reason).toBe("c.md:1: says count of modules jsr is 5; 2 are read");
    expect(counted.lines).toEqual(['c.md:1 (no line from here to the next blank line states 5): "## jsr/"']);
  });
});
