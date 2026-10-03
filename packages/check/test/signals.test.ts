// Signals and matching (Anchor, harnesses and A3, section 5.3).
import { describe, expect, it } from "vitest";
import { matches, type Report, signalsOf } from "../src/index.ts";

const report = {
  schema: "csh-report/v1",
  moduleDigest: "sha256:0",
  tool: { version: "0", solver: "z3", budgetMs: 1 },
  findings: [
    {
      id: "aaaaaaaaaaaaaaaa",
      kind: "example-divergence",
      scope: "specification",
      members: [
        { fragment: "S/@Tests/ThirdFailure", source: "Tests", authority: "candidate", digest: "d1" },
        { fragment: "S/@Scenarios/ThirdFailedAttempt", source: "Scenarios", authority: "candidate", digest: "d2" },
      ],
      context: [],
      crossSource: true,
      collisionTerms: [],
      inputs: "overlapping",
      query: "Q-DIV(S/@Scenarios/ThirdFailedAttempt, S/@Tests/ThirdFailure)",
    },
  ],
  notComparable: [{ fragment: "S/I/Lock", source: "intent", reason: "unit" }],
  gapView: { sources: [], rows: [], gaps: [{ kind: "uncited", subject: "Product/LCK-004", fragments: [] }, { kind: "no-rule", subject: "S/@Tests/ThirdFailure", fragments: ["S/@Tests/ThirdFailure"] }] },
  assessments: [],
  unliftable: [],
  errors: [{ code: "dangling-citation", severity: "error", detail: "LCK-009 is not in Product", fragment: "S/@Tests/X", source: "Tests" }],
  diagnostics: [],
  executions: [],
  items: [],
  component: { name: "S", digest: "sha256:1", sources: { Tests: "tdd", Scenarios: "bdd", Product: "ears" } },
} as unknown as Report;

describe("signalsOf", () => {
  const signals = signalsOf(report);

  it("gives every finding, not comparable, error and gap a signal, in order of kind", () => {
    expect(signals.map((s) => s.kind)).toEqual(["dangling-citation", "example-divergence", "no-rule", "not-comparable", "uncited"]);
  });

  it("keeps a finding's id and names its members, sources and practices", () => {
    const d = signals.find((s) => s.kind === "example-divergence")!;
    expect(d.id).toBe("aaaaaaaaaaaaaaaa");
    expect(d.fragments).toEqual(["S/@Scenarios/ThirdFailedAttempt", "S/@Tests/ThirdFailure"]);
    expect(d.sources).toEqual(["Scenarios", "Tests"]);
    expect(d.practices).toEqual(["bdd", "tdd"]);
    expect(d.detail).toContain("inputs overlapping");
  });

  it("gives other signals an id from the kind and members that does not change between runs", () => {
    expect(signalsOf(report).map((s) => s.id)).toEqual(signals.map((s) => s.id));
    const g = signals.find((s) => s.kind === "no-rule")!;
    expect(g.id).toMatch(/^[0-9a-f]{16}$/);
    expect(g.sources).toEqual(["Tests"]);
    expect(g.practices).toEqual(["tdd"]);
  });

  it("takes practices from the manifest when one is given", () => {
    const d = signalsOf(report, { sources: { Tests: "unit" } }).find((s) => s.kind === "example-divergence")!;
    expect(d.practices).toEqual(["unit"]);
  });
});

describe("matches", () => {
  const signals = signalsOf(report);
  const d = signals.find((s) => s.kind === "example-divergence")!;

  it("matches on kind and every field the rule sets", () => {
    expect(matches(d, { kind: "example-divergence" })).toBe(true);
    expect(matches(d, { kind: "example-conflict" })).toBe(false);
    expect(matches(d, { kind: "example-divergence", fragment: "ThirdFailedAttempt" })).toBe(true);
    expect(matches(d, { kind: "example-divergence", fragment: "S/@Tests/ThirdFailure" })).toBe(true);
    expect(matches(d, { kind: "example-divergence", fragment: "Third" })).toBe(false);
    expect(matches(d, { kind: "example-divergence", source: "Scenarios", practice: "tdd" })).toBe(true);
    expect(matches(d, { kind: "example-divergence", practice: "ears" })).toBe(false);
  });

  it("excludes what the not rule matches", () => {
    expect(matches(d, { kind: "example-divergence", not: { kind: "example-divergence", source: "Tests" } })).toBe(false);
    expect(matches(d, { kind: "example-divergence", not: { kind: "example-divergence", source: "Product" } })).toBe(true);
  });

  it("matches a gap's subject exactly or by its last segment", () => {
    const u = signals.find((s) => s.kind === "uncited")!;
    expect(matches(u, { kind: "uncited", subject: "Product/LCK-004" })).toBe(true);
    expect(matches(u, { kind: "uncited", subject: "LCK-005" })).toBe(false);
  });
});

describe("signals of gaps", () => {
  it("names the source a gap's subject belongs to", () => {
    const u = signalsOf(report).find((s) => s.kind === "uncited")!;
    expect(u.sources).toEqual(["Product"]);
    expect(u.practices).toEqual(["ears"]);
  });
});
