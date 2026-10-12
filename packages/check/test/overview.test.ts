// The overview says why: a violated rule lists the edges that break it, not only its authority.
import { describe, expect, it } from "vitest";
import { GAP_NEXT, INDETERMINATE_NEXT, overviewOf, type Report } from "../src/index.ts";

const report = (assessments: unknown[]): Report =>
  ({ findings: [], assessments, notComparable: [], errors: [], gapView: { sources: [], rows: [], gaps: [] }, items: [], outcomes: [], diagnostics: [], unliftable: [], edges: [], component: { sources: {} } }) as unknown as Report;

const violated = (reasons: string[]) => ({ fragment: "S/Layering/Rule", kind: "architecture", source: "intent", digest: "d", authority: "candidate", selfApproved: false, needsReview: false, verdict: "violated", applicability: "current", critical: false, methods: [], findings: [], evidence: [], reasons });

describe("overview detail", () => {
  it("names the edges that violate a rule", () => {
    const e = overviewOf(report([violated(["a.ts:1: a.ts -> b.ts", "c.ts:2: c.ts -> b.ts"])])).entries.find((x) => x.kind === "violated")!;
    expect(e.detail).toBe("a.ts:1: a.ts -> b.ts; c.ts:2: c.ts -> b.ts");
  });

  it("counts the reasons past the sixth rather than listing hundreds", () => {
    const many = Array.from({ length: 9 }, (_, i) => `f${i}.ts:1: f${i}.ts -> b.ts`);
    const e = overviewOf(report([violated(many)])).entries.find((x) => x.kind === "violated")!;
    expect(e.detail!.split("; ")).toHaveLength(7);
    expect(e.detail).toMatch(/and 3 more$/);
  });

  it("places every step-matching signal with what would close or decide it (stage 45)", () => {
    expect(GAP_NEXT["undefined-step"]).toMatch(/step definition/);
    expect(GAP_NEXT["unused-step-definition"]).toMatch(/scenario/);
    expect(INDETERMINATE_NEXT["steps-undecided"]).toMatch(/by hand/);
  });
});
