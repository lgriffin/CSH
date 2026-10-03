// The gate's dispositions under a probe (Anchor, harnesses and A3, section 8), run by the gate component's harness with
// node --test, not by vitest. The cases are the ones test/gate.test.ts asserts; each call to gate is recorded as a
// witness of the event Decide in spec/gate.csl.ts. The probe maps the one assessment in the report to the event's
// arguments and the obligation's disposition to its result. A case whose report has no approved assessment gives the
// gate nothing to decide, so it is called without the probe and leaves a passing test with no witness.
import assert from "node:assert/strict";
import { test } from "node:test";
import { probe } from "@csh/harness";
import type { Assessment, Report } from "@csh/check";
import { gate, type GateInput, type Mode, type Snapshot, type Waiver, waiverValid } from "../src/index.ts";

const snapshot: Snapshot = { commit: "c1", moduleDigest: "m", ledgerHead: 3, configDigest: "cfg", lockDigest: "lock", tool: { version: "0.1.0", solver: "z3" } };

const assessment = (p: Partial<Assessment>): Assessment => ({
  fragment: "Account/#invariant/NonNegative",
  kind: "invariant",
  source: "intent",
  digest: "d1",
  authority: "approved",
  selfApproved: false,
  needsReview: false,
  verdict: "satisfied",
  applicability: "current",
  critical: false,
  methods: [],
  evidence: [],
  reasons: [],
  findings: [],
  ...p,
});

const report = (as: Assessment[]): Report => ({
  schema: "csh-report/v1",
  moduleDigest: "m",
  tool: { version: "0.1.0", solver: "z3", budgetMs: 5000 },
  findings: [],
  notComparable: [],
  gapView: { sources: [], rows: [], gaps: [] },
  assessments: as,
  unliftable: [],
  errors: [],
  diagnostics: [],
  executions: [],
  items: [],
});

const only = (input: GateInput): Assessment => input.report.assessments![0]!;

/** Whether a waiver the gate would accept is in scope for the assessment: the fact the model takes as waiverValid. */
const validWaiver = (input: GateInput): boolean => {
  const a = only(input);
  return input.waivers.some((w) => w.fragment === a.fragment && w.digest === a.digest && (w.scope === a.fragment || a.findings.includes(w.scope)) && waiverValid(w, input.commitDate));
};

const decideProbe = probe("Decide", gate, {
  pre: () => ({}),
  args: (input) => {
    const a = only(input);
    return { verdict: a.verdict, applicability: a.applicability, mode: input.mode, waiverValid: validWaiver(input), critical: a.critical, selfApproved: a.selfApproved, needsReview: a.needsReview };
  },
  post: () => ({}),
  result: (d) => d.obligations[0]?.disposition ?? null,
  mocked: [],
});

const input = (a: Partial<Assessment>, mode: Mode, waivers: Waiver[] = [], commitDate = "2026-10-01T10:00:00Z"): GateInput => ({ report: report([assessment(a)]), snapshot, mode, waivers, commitDate });

const rows: [string, Partial<Assessment>, Mode, string, string][] = [
  ["satisfied gives allow", {}, "enforcing", "allow", "GATE-006"],
  ["conflicting, enforcing gives block", { verdict: "conflicting" }, "enforcing", "block", "GATE-001"],
  ["conflicting, advisory gives review", { verdict: "conflicting" }, "advisory", "review", "GATE-001"],
  ["violated, enforcing gives block", { verdict: "violated" }, "enforcing", "block", "GATE-002"],
  ["unknown gives review", { verdict: "unknown" }, "enforcing", "review", "GATE-005"],
  ["unknown, critical, enforcing gives block", { verdict: "unknown", critical: true }, "enforcing", "block", "GATE-004"],
  ["unknown, critical, advisory gives review", { verdict: "unknown", critical: true }, "advisory", "review", "GATE-004"],
  ["stale gives review", { applicability: "stale" }, "enforcing", "review", "GATE-005"],
  ["self-approved needing review gives review", { selfApproved: true, needsReview: true }, "enforcing", "review", "GATE-007"],
  ["self-approved, solo gives allow", { selfApproved: true }, "enforcing", "allow", "GATE-006"],
];

for (const [name, a, mode, disposition, cite] of rows) {
  test(name, (t) => {
    const d = decideProbe.in(t, { cites: [cite] })(input(a, mode));
    assert.equal(d.obligations[0]!.disposition, disposition);
  });
}

test("records what enforcing mode would do in advisory mode", (t) => {
  const d = decideProbe.in(t, { cites: ["GATE-002"] })(input({ verdict: "violated" }, "advisory"));
  assert.equal(d.obligations[0]!.disposition, "review");
  assert.equal(d.obligations[0]!.recommends, "block");
});

test("ignores candidate obligations, listing them", () => {
  const d = gate(input({ authority: "candidate", verdict: "violated" }, "enforcing"));
  assert.deepEqual(d.obligations, []);
  assert.equal(d.overall, "allow");
});

const waiver: Waiver = { seq: 4, fragment: "Account/#invariant/NonNegative", digest: "d1", scope: "Account/#invariant/NonNegative", expires: "2026-10-15" };

test("waives a violation until the waiver expires, judged by the commit date", (t) => {
  const decide = decideProbe.in(t, { cites: ["GATE-002", "GATE-003"] });
  assert.equal(decide(input({ verdict: "violated" }, "enforcing", [waiver])).obligations[0]!.disposition, "waived");
  assert.equal(decide(input({ verdict: "violated" }, "enforcing", [waiver], "2026-10-15T23:00:00Z")).obligations[0]!.disposition, "waived");
  assert.equal(decide(input({ verdict: "violated" }, "enforcing", [waiver], "2026-10-16T00:00:00Z")).obligations[0]!.disposition, "block");
});

test("does not apply a waiver at another digest", (t) => {
  assert.equal(decideProbe.in(t, { cites: ["GATE-002"] })(input({ verdict: "violated", digest: "d2" }, "enforcing", [waiver])).obligations[0]!.disposition, "block");
});

test("waives a finding-scoped waiver only when the finding is the obligation's", (t) => {
  const w = { ...waiver, scope: "f123" };
  const decide = decideProbe.in(t, { cites: ["GATE-002", "GATE-003"] });
  assert.equal(decide(input({ verdict: "violated", findings: ["f123"] }, "enforcing", [w])).obligations[0]!.disposition, "waived");
  assert.equal(decide(input({ verdict: "violated", findings: ["f999"] }, "enforcing", [w])).obligations[0]!.disposition, "block");
});
