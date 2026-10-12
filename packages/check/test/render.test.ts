// Claim findings shown as the sentence that holds the claim (From real runs, stage 46).
import { describe, expect, it } from "vitest";
import { claimSpans, type Finding, lineHolding } from "../src/index.ts";

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
});
