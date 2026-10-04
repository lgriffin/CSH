// The A3 model and its renderings (Anchor, harnesses and A3, section 5).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseComponent } from "@csh/component";
import { stableJson } from "@csh/kernel";
import { buildA3, type BuildInput, type Judgments, readJudgments, readStage, renderHtml, renderMarkdown, skeleton, stageDir, stageIntegrity, type StageRecord, validateJudgments } from "../src/index.ts";

const F = (id: string) => resolve(import.meta.dirname, "../../../fixtures", id, "inputs");
const manifest = parseComponent(readFileSync(join(F("F91"), "component.json"))).component!.manifest;
const base = readJudgments(F("F94"), "lock")!.judgments;
const stagesOf = (dir: string, j: Judgments) => j.stages.map((s) => readStage(stageDir(dir, "lock", s.id), s.id)).filter((s): s is StageRecord => s !== undefined);
// F94's "before" stage was tampered with; rebuild it from F91's first stage under the id "before".
const before = { ...readStage(stageDir(F("F91"), "lock", "first"), "first")!, id: "before" };
const after = readStage(stageDir(F("F94"), "lock", "after"), "after")!;

function input(j: Partial<Judgments> = {}, over: Partial<BuildInput> = {}): BuildInput {
  return { slug: "lock", judgments: { ...base, ...j }, judgmentsDigest: "sha256:0", component: { name: "Lock", practices: manifest.practices }, stages: [before, after], authority: { authority: "candidate" }, ...over };
}

describe("buildA3", () => {
  it("counts every signal of every stage and places each by the first matching cause and lane", () => {
    const m = buildA3(input());
    expect(m.stages.map((s) => s.signals.length)).toEqual([2, 1]);
    expect(m.stages[0]!.signals.find((s) => s.kind === "example-conflict")?.cause).toBe("count");
    expect(m.lanes.find((l) => l.id === "tests")?.counts).toEqual([1, 0]);
    expect(m.stages[0]!.tests).toEqual({ passed: 1, total: 1 });
  });

  it("counts a test once however many witnesses it records, and as passed only when all its executions passed", () => {
    const e = { source: "UnitTests", event: "SignIn", localResult: "passed" };
    const executions = [{ ...e, witness: "a", test: "t.ts::a" }, { ...e, witness: "a-2", test: "t.ts::a" }, { ...e, witness: "b", test: "t.ts::b" }, { ...e, witness: "b-2", test: "t.ts::b", localResult: "failed" }];
    const stage = { ...before, report: { ...before.report, executions } };
    expect(buildA3(input({}, { stages: [stage] })).stages[0]!.tests).toEqual({ passed: 1, total: 2 });
  });

  it("counts the same test identity from two sources as two tests", () => {
    const e = { event: "SignIn", test: "t.ts::a" };
    const executions = [{ ...e, source: "UnitTests", witness: "a", localResult: "passed" }, { ...e, source: "OtherTests", witness: "a", localResult: "failed" }];
    const stage = { ...before, report: { ...before.report, executions } };
    expect(buildA3(input({}, { stages: [stage] })).stages[0]!.tests).toEqual({ passed: 1, total: 2 });
  });

  it("counts a test that recorded no witness, from its unobserved-test gap, old subject or new (#27)", () => {
    const executions = [{ source: "UnitTests", event: "SignIn", witness: "a", test: "t.ts::a", localResult: "passed" }];
    const gap = (subject: string, detail: string) => ({ kind: "unobserved-test", subject, fragments: [], detail });
    const gaps = [gap("UnitTests/t.ts::b", "e.ndjson:2: passed, and no witness from UnitTests"), gap("t.ts::c", "e.ndjson:3: failed, and no witness from UnitTests"), gap("UnitTests/t.ts::a", "e.ndjson:1: passed, and no witness from UnitTests")];
    const stage = { ...before, report: { ...before.report, executions, gapView: { ...before.report.gapView, gaps: [...before.report.gapView.gaps, ...gaps] } } };
    expect(buildA3(input({}, { stages: [stage] })).stages[0]!.tests).toEqual({ passed: 2, total: 3 });
  });

  it("computes each countermeasure's status from the stages", () => {
    const cms = (c: Judgments["countermeasures"]) => buildA3(input({ countermeasures: c })).countermeasures.map((x) => x.status);
    expect(cms([{ id: "A", kind: "requirement", what: "", answers: ["Q1"], clears: [{ kind: "example-conflict" }] }])).toEqual(["verified"]);
    expect(cms([{ id: "A", kind: "requirement", what: "", answers: ["Q1"], clears: [{ kind: "uncited" }] }])).toEqual(["not cleared"]);
    expect(cms([{ id: "A", kind: "requirement", what: "", answers: ["Q1"], clears: [{ kind: "vacuous" }] }])).toEqual(["nothing to clear"]);
    expect(cms([{ id: "A", kind: "harness", what: "", answers: ["Q1"], expects: [{ kind: "example-conflict" }] }])).toEqual(["verified"]);
    expect(cms([{ id: "A", kind: "harness", what: "", answers: ["Q1"], expects: [{ kind: "example-divergence" }] }])).toEqual(["proposed"]);
    expect(cms([{ id: "A", kind: "process", what: "", answers: ["Q1"], stage: "after" }])).toEqual(["proposed"]);
    expect(cms([{ id: "A", kind: "scope", what: "", answers: ["Q1"] }])).toEqual(["owner decides"]);
  });

  it("reports problems with the judgments and never repairs them", () => {
    const m = buildA3(
      input({
        lanes: [...base.lanes, { id: "x", practice: "bdd", step: 1, title: "", where: "", match: [] }],
        decisionPoints: [{ point: "P", class: "silence", says: { qa: { mark: "says", text: "" } }, match: [{ kind: "uncited" }] }],
        rca: [...base.rca, { id: "Q2", q: "Unanswered?", a: "", depth: "", evidence: { file: "src/lock.ts", text: "x > 2" } }],
        countermeasures: [...base.countermeasures, { id: "C2", kind: "test", what: "", answers: [] }],
      }),
    );
    const kinds = m.problems.map((p) => `${p.kind} ${p.subject}`);
    expect(kinds).toContain("unknown-practice lane x");
    expect(kinds).toContain('unknown-practice decision point "P"');
    expect(kinds).toContain("unanswered Q2");
    expect(kinds).toContain("unverifiable C2");
    expect(kinds).toContain("dangling-pointer Q2 evidence");
  });

  it("resolves a file pointer against the file as it stood at the stage's commit", () => {
    const rca = [{ id: "Q1", q: "", a: "", depth: "", evidence: { file: "src/lock.ts", text: "x > 2", stage: "before" } }];
    const seen: string[] = [];
    const ok = buildA3(input({ rca }, { readAt: (s, f) => (seen.push(`${s.run.snapshot.commit}:${f}`), "if (x > 2) lock();") }));
    expect(ok.rca[0]!.evidence?.resolves).toBe(true);
    expect(seen).toEqual([`${before.run.snapshot.commit}:src/lock.ts`]);
    const gone = buildA3(input({ rca }, { readAt: () => null }));
    expect(gone.problems.find((p) => p.kind === "dangling-pointer")?.detail).toMatch(/cannot be read/);
  });

  it("measures the eighth default, examples that cite a requirement, and takes a target from the judgments", () => {
    const m = buildA3(input({ targets: { conflicts: "1" } }));
    expect(m.measures.map((x) => x.id)).toEqual(["conflicts", "not-comparable", "drift", "no-rule", "silences", "satisfied", "gate", "cited"]);
    expect(m.measures[0]!.values.map((v) => v.met)).toEqual([true, true]);
  });

  it("gives the same model for the same inputs", () => {
    expect(stableJson(buildA3(input()))).toBe(stableJson(buildA3(input())));
  });

  it("shows a missing stage record as a problem", () => {
    const m = buildA3(input({}, { stages: [before] }));
    expect(m.problems.some((p) => p.kind === "missing-stage" && p.subject === "after")).toBe(true);
  });
});

describe("stage records", () => {
  it("fail integrity when a file differs from the digest its run record names", () => {
    const [tampered, intact] = stagesOf(F("F94"), base);
    expect(stageIntegrity(tampered!)?.problem).toBe("stage-mismatch");
    expect(stageIntegrity(intact!)).toBeUndefined();
  });

  it("refuse judgments whose evidence is not a pointer or whose mark is not one of the four", () => {
    const bad = { ...base, rca: [{ id: "Q1", q: "", a: "", depth: "", evidence: null }], decisionPoints: [{ point: "P", class: "silence", says: { qa: { mark: "x", text: "" } }, match: [] }] };
    const problems = validateJudgments(bad);
    expect(problems.some((p) => p.startsWith("rca[0]: evidence"))).toBe(true);
    expect(problems.some((p) => p.startsWith("decisionPoints[0]: says"))).toBe(true);
    expect(validateJudgments(base)).toEqual([]);
  });
});

describe("rendering", () => {
  it("writes 'Not yet written' for every empty judged section of a skeleton", () => {
    const m = buildA3(input(skeleton("before", manifest.practices), { stages: [before] }));
    const md = renderMarkdown(m);
    expect(md).toMatch(/# A3: Not yet written\./);
    expect(md.match(/_Not yet written\._/g)!.length).toBeGreaterThanOrEqual(6);
    expect(m.problems.filter((p) => p.kind === "unclassified").length).toBe(m.stages[0]!.signals.length);
    const html = renderHtml(m);
    expect(html).toMatch(/class="unwritten"/);
  });

  it("states the authority of the judgments", () => {
    expect(renderMarkdown(buildA3(input({}, { authority: { authority: "approved", selfApproved: true } })))).toMatch(/\*\*Authority\.\*\* approved \(self-approved\)/);
    expect(renderMarkdown(buildA3(input({}, { authority: { authority: "candidate", reason: "digest-changed" } })))).toMatch(/candidate \(digest-changed\)/);
  });

  it("escapes judged text and loads nothing from outside the page", () => {
    const html = renderHtml(buildA3(input({ title: "<script>alert(1)</script>" })));
    expect(html).not.toMatch(/<script>alert/);
    expect(html).toMatch(/&lt;script&gt;alert/);
    expect(html).not.toMatch(/(src|href)="https?:/);
  });

  it("keeps a decision point's mark inside its class attribute, and raw HTML out of the Markdown", () => {
    const mark = 'says" onmouseover="alert(1)' as "says";
    const m = buildA3(input({ title: "<img src=x onerror=alert(1)>", decisionPoints: [{ point: "<b>P</b>", class: "silence", says: { qa: { mark, text: "<i>t</i>" } }, match: [] }] }));
    expect(renderHtml(m)).not.toMatch(/onmouseover/);
    const md = renderMarkdown(m);
    expect(md).not.toMatch(/(^|[^\\])<(img|b|i)\b/);
    expect(md).toMatch(/# A3: \\<img/);
    const slashed = renderMarkdown(buildA3(input({ title: "\\<img src=x onerror=alert(1)>" })));
    expect(slashed).toMatch(/# A3: \\\\\\<img/);
  });
});
