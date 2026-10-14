// Danger (Analyse, danger and grain, section 3; stage 56): a view across the three outcomes. Each shape is established
// from what the report holds, and an entry keeps its outcome when it is marked.
import { describe, expect, it } from "vitest";
import { type Analysis, overviewOf, renderAnalysis, renderOverview, type Report, sectionsOf } from "../src/index.ts";

interface Parts {
  assessments?: unknown[];
  gaps?: { kind: string; subject: string; fragments?: string[]; detail?: string }[];
  executions?: unknown[];
  items?: unknown[];
  rungs?: unknown[];
}

const report = (p: Parts): Report =>
  ({
    findings: [],
    assessments: p.assessments ?? [],
    notComparable: [],
    errors: [],
    gapView: { sources: [], rows: [], gaps: (p.gaps ?? []).map((g) => ({ fragments: [], ...g })) },
    items: p.items ?? [],
    executions: p.executions ?? [],
    rungs: p.rungs,
    outcomes: [],
    diagnostics: [],
    unliftable: [],
    edges: [],
    component: { sources: {} },
  }) as unknown as Report;

const rule = (over: Record<string, unknown> = {}) => ({ fragment: "S/Lockout/LockOnThird", kind: "requirement", source: "intent", digest: "d", authority: "approved", selfApproved: false, needsReview: false, verdict: "satisfied", applicability: "current", critical: false, methods: [], findings: [], evidence: [], reasons: [], ...over });
const violating = { witness: "w1", source: "UnitTests", applicability: "current", result: "violated" };
const passed = { witness: "w1", source: "UnitTests", event: "SignIn", localResult: "passed", test: "test/a.test.ts::allows a third failure" };

const dangerOf = (r: Report) => overviewOf(r).entries.filter((e) => e.danger !== undefined).map((e) => [e.outcome, e.kind, e.danger!.structure, e.danger!.shape, e.danger!.of]);

describe("danger", () => {
  it("marks a violation through a passing test's own witness as masked, green over refuted", () => {
    const o = overviewOf(report({ assessments: [rule({ verdict: "violated", evidence: [violating] })], executions: [passed] }));
    const e = o.entries.find((x) => x.danger !== undefined)!;
    expect([e.outcome, e.kind, e.danger!.structure, e.danger!.shape]).toEqual(["gap", "violated", "masked", "green-over-refuted"]);
    expect(e.danger!.green).toContain("allows a third failure");
    expect(o.danger).toEqual({ refuted: 0, masked: 1 });
  });

  it("marks a violation with no passing test behind it as refuted", () => {
    expect(dangerOf(report({ assessments: [rule({ verdict: "violated", evidence: [violating] })] }))).toEqual([["gap", "violated", "refuted", "code-breaks-rule", "S/Lockout/LockOnThird"]]);
    expect(dangerOf(report({ assessments: [rule({ verdict: "violated", evidence: [violating] })], executions: [{ ...passed, localResult: "failed" }] }))).toEqual([["gap", "violated", "refuted", "code-breaks-rule", "S/Lockout/LockOnThird"]]);
  });

  it("marks a conflict between a rule and what a passing test observed as masked, whatever the rule's authority", () => {
    const finding = { id: "f1", kind: "example-conflict", members: [{ fragment: "S/@UnitTests/WitnessW1", source: "UnitTests", authority: "candidate" }, { fragment: "S/Funds/Floor", source: "intent", authority: "candidate" }], scope: "specification", crossSource: true, collisionTerms: [], context: [] };
    const r = (localResult: string) => ({ ...report({ executions: [{ ...passed, localResult, example: "S/@UnitTests/WitnessW1" }] }), findings: [finding] }) as unknown as Report;
    expect(dangerOf(r("passed"))).toEqual([["gap", "example-conflict", "masked", "green-over-refuted", "S/Funds/Floor"]]);
    expect(dangerOf(r("failed"))).toEqual([["gap", "example-conflict", "refuted", "code-breaks-rule", "S/Funds/Floor"]]);
    // Two statements that disagree, with no test behind either, are a conflict and not danger.
    expect(dangerOf({ ...report({}), findings: [finding] } as unknown as Report)).toEqual([]);
  });

  it("marks a passing test that no rule constrains, and not a scenario no rule constrains", () => {
    const r = (example: string) => report({ gaps: [{ kind: "no-rule", subject: example, fragments: [example] }], executions: [{ ...passed, example: "S/@UnitTests/WitnessW1" }] });
    expect(dangerOf(r("S/@UnitTests/WitnessW1"))).toEqual([["gap", "no-rule", "masked", "test-under-no-rule", "S/@UnitTests/WitnessW1"]]);
    expect(dangerOf(r("S/@Scenarios/ScenarioLocks"))).toEqual([]);
  });

  it("marks prose the file tree refutes as refuted", () => {
    expect(dangerOf(report({ gaps: [{ kind: "dangling-reference", subject: "Docs/README.md", detail: "names what does not exist: a.ts" }] }))).toEqual([["gap", "dangling-reference", "refuted", "code-refutes-prose", "Docs/README.md"]]);
  });

  it("marks a told rule whose citing tests do not observe its terms as citation without observation", () => {
    const detail = "docs/r.md:3: constrains `window`, `floor`; the test citing it (tests/a.test.ts:4) observes `window` only; not observed: `floor`; read by the typescript reader";
    const r = report({ gaps: [{ kind: "unobserved-terms", subject: "Req/R-1", fragments: [], detail }] });
    expect(dangerOf(r)).toEqual([["gap", "unobserved-terms", "masked", "citation-without-observation", "Req/R-1"]]);
    expect(overviewOf(r).entries[0]!.danger!.green).toBe("cited by tests/a.test.ts:4");
  });

  it("marks a told rule that claims a rung the ladder does not find, and only then", () => {
    const item = (id: string, claims?: string) => ({ source: "Docs", id, span: `README.md:${id}`, textDigest: "t", kind: "requirement", attrs: { lifted: "layering", ...(claims !== undefined ? { claims } : {}) } });
    const r = report({
      gaps: ["7", "8", "9"].map((id) => ({ kind: "unverified", subject: `Docs/${id}` })),
      items: [item("7"), item("8", "guaranteed"), item("9", "enforced")],
      rungs: [{ item: "Docs/7", rung: "L2", by: [] }, { item: "Docs/8", rung: "L2", by: [] }, { item: "Docs/9", rung: "L3", by: [] }],
    });
    expect(dangerOf(r)).toEqual([["gap", "unverified", "masked", "rung-overclaimed", "Docs/8"]]);
    expect(overviewOf(r).entries.find((e) => e.subject === "Docs/8")!.danger!.green).toBe('it says "guaranteed", and the ladder finds L2');
  });

  it("marks a stated status nothing supports as a rung overclaimed", () => {
    const r = report({ gaps: [{ kind: "status-unsupported", subject: "Req/R-1" }], items: [{ source: "Req", id: "R-1", span: "r.md:3", textDigest: "t", kind: "requirement", attrs: { status: "verified" } }] });
    expect(dangerOf(r)).toEqual([["gap", "status-unsupported", "masked", "rung-overclaimed", "Req/R-1"]]);
  });

  it("marks silence beside an approved rule, and not beside a candidate", () => {
    const gap = { kind: "no-example", subject: "S/Lockout/LockOnThird", fragments: ["S/Lockout/LockOnThird"] };
    expect(dangerOf(report({ assessments: [rule({ verdict: "unknown" })], gaps: [gap] }))).toEqual([["gap", "no-example", "masked", "silence-beside-rule", "S/Lockout/LockOnThird"]]);
    expect(dangerOf(report({ assessments: [rule({ verdict: "unknown", authority: "candidate" })], gaps: [gap] }))).toEqual([]);
  });

  it("marks a self-approved convergence, and an approval by another as nothing", () => {
    expect(dangerOf(report({ assessments: [rule({ selfApproved: true })] }))).toEqual([["converged", "satisfied", "masked", "self-approved", "S/Lockout/LockOnThird"]]);
    expect(dangerOf(report({ assessments: [rule()] }))).toEqual([]);
  });

  it("never marks what is honest: an unknown obligation, a red test, a plain unverified rule", () => {
    const r = report({ assessments: [rule({ verdict: "unknown", selfApproved: true })], gaps: [{ kind: "failing-test", subject: "Tests/a.test.ts" }, { kind: "unverified", subject: "Docs/7" }] });
    expect(dangerOf(r)).toEqual([]);
    expect(overviewOf(r).danger).toEqual({ refuted: 0, masked: 0 });
  });

  it("is reported first and keeps each entry's outcome; the analysis reports it only under Danger", () => {
    const o = overviewOf(report({ assessments: [rule({ verdict: "violated", evidence: [violating] }), rule({ fragment: "S/Lockout/Other", selfApproved: true })], executions: [passed], gaps: [{ kind: "unverified", subject: "Docs/7" }] }));
    expect(o.counts).toEqual({ gap: 2, indeterminate: 0, converged: 1 });
    const text = renderOverview(o);
    expect(text.indexOf("== Danger")).toBeLessThan(text.indexOf("== Gaps"));
    expect(text).toContain("(0 refuted, 2 masked)");
    const a: Analysis = { schema: "csh-analysis/v1", subject: { path: "/r", repo: "/r", commit: "c".repeat(40) }, profile: { kind: "proposed" }, guesses: [], told: [], overview: o };
    const s = sectionsOf(a);
    expect(s.danger.map((e) => e.kind)).toEqual(["violated", "satisfied"]);
    expect(s.gaps.map((e) => e.kind)).toEqual(["unverified"]);
    expect(s.converged).toEqual([]);
    const rendered = renderAnalysis(a);
    expect(rendered).toContain("danger: masked, green over refuted: the test test/a.test.ts::allows a third failure passes");
    expect(rendered).toContain("of these, 0 refuted and 2 masked");
  });
});
