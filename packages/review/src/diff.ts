// The change review (Next layers, section 5.1): what a change did to the results, as a model computed from two stored
// runs of one component. Pure functions: nothing here reads a file, runs a command or decides anything. Observations
// are plain statements about the change and never a verdict.
import { type Report, type Signal, signalsOf } from "@csh/check";
import type { GateDecision } from "@csh/gate";
import { compareCodePoints, fragmentsOf, type Module } from "@csh/kernel";
import type { RunRecord } from "@csh/run";

/** One side of a diff: a stored run's record, report and gate decision, and its model when the run kept one. */
export interface RunSide {
  run: RunRecord;
  report: Report;
  gate: GateDecision;
  model?: Module;
}

/** A side that could not be had, with why: a refused run at a past commit, a component that did not exist yet. */
export interface Unavailable {
  unavailable: string;
}

/** What the diff needs of a component manifest, structurally (csh/component.json). */
export interface ManifestView {
  spec: string;
  implementation: string[];
  practices: { id: string; kind: string; sources: string[]; adapter?: string; steps?: string; harness?: { run: string[]; witnesses: string; executions?: string } }[];
}

export type Observation =
  | { k: "approval-lost"; fragment: string }
  | { k: "rule-and-evidence-moved-together"; practices: string[] }
  | { k: "implementation-and-tests-changed-together" }
  | { k: "evidence-removed"; tests: string[] }
  | { k: "spec-untouched" };

export interface ObligationMove {
  fragment: string;
  /** Before, after; "absent" on the side that does not have the obligation. */
  authority: [string, string];
  verdict: [string, string];
  applicability: [string, string];
  disposition: [string, string];
  /** Extension: the head's reasons, for a rule that became unknown or stale. */
  reasons?: string[];
}

export interface RunDiff {
  schema: "csh-diff/v1";
  component: string;
  /** made, or which side could not be had: then the diff shows the other side alone and says so. */
  comparison: "made" | "base-unavailable" | "head-unavailable";
  base: { commit: string; snapshotDigest: string } | { unavailable: string };
  head: { commit: string; snapshotDigest: string } | { unavailable: string };
  fragments: { added: string[]; removed: string[]; changed: { fragment: string; authorityBefore: string; authorityAfter: string }[] };
  obligations: ObligationMove[];
  signals: { appeared: Signal[]; cleared: Signal[]; persisting: number };
  evidence: { testsAdded: string[]; testsRemoved: string[]; newlyUnobserved: string[] };
  inputs: { practice: string; changed: boolean }[];
  gate: [string, string];
  observations: Observation[];
  /** Extension: the side that could be had, when the other could not: its signals and obligations, unpaired. */
  alone?: { side: "base" | "head"; signals: Signal[]; obligations: { fragment: string; authority: string; verdict: string; applicability: string }[] };
}

export interface DiffContext {
  /** Paths changed between the two commits, relative to the component root, as git reports them. */
  changes?: string[];
  manifest?: ManifestView;
}

const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort(compareCodePoints);
const isUnavailable = (s: RunSide | Unavailable): s is Unavailable => "unavailable" in s;

/** Fragments of a side, by name: from its model when kept, else the obligations its report assesses. */
function fragmentsOfSide(s: RunSide): Map<string, string> {
  if (s.model !== undefined) return new Map(fragmentsOf(s.model).map((f) => [f.name, f.digest]));
  return new Map((s.report.assessments ?? []).map((a) => [a.fragment, a.digest]));
}

function authorityOf(s: RunSide, fragment: string): string {
  return s.report.assessments?.find((a) => a.fragment === fragment)?.authority ?? "unknown";
}

function dispositionOf(s: RunSide, fragment: string): string {
  const o = s.gate.obligations.find((x) => x.fragment === fragment);
  if (o !== undefined) return o.disposition;
  return (s.gate.candidates?.obligations ?? []).includes(fragment) ? "candidate" : "none";
}

/** Tests a run saw finish, by source and test identity. */
function testsOf(s: RunSide): Set<string> {
  return new Set((s.report.executions ?? []).filter((e) => e.test !== undefined).map((e) => `${e.source}/${e.test}`));
}

const under = (path: string, root: string) => path === root || path.startsWith(`${root.replace(/\/$/, "")}/`);

/** The paths a practice's results depend on: its sources, its adapter and step table, and the files its harness names. */
function practicePaths(p: ManifestView["practices"][number], model: Module | undefined): string[] {
  const out: string[] = [];
  for (const s of p.sources) {
    const at = model?.sources.find((x) => x.name === s)?.at;
    if (at !== undefined) out.push(at);
  }
  if (p.adapter !== undefined && (p.adapter.startsWith("./") || p.adapter.startsWith("../"))) out.push(p.adapter.replace(/^\.\//, ""));
  if (p.steps !== undefined) out.push(p.steps);
  // A harness's arguments that read as files of the project: the tests it runs.
  for (const a of p.harness?.run.slice(1) ?? []) if (!a.startsWith("-") && /[/.]/.test(a) && !a.startsWith("@")) out.push(a.replace(/^\.\//, ""));
  const written = new Set([p.harness?.witnesses, p.harness?.executions].filter((x): x is string => x !== undefined));
  return out.filter((x) => !written.has(x));
}

const EVIDENCE_KINDS = new Set(["tests", "scenarios", "facts"]);

function observe(d: RunDiff, ctx: DiffContext): void {
  for (const c of d.fragments.changed) if (c.authorityBefore === "approved" && c.authorityAfter !== "approved") d.observations.push({ k: "approval-lost", fragment: c.fragment });
  for (const o of d.obligations) {
    if (d.fragments.changed.some((c) => c.fragment === o.fragment)) continue;
    if (o.authority[0] === "approved" && o.authority[1] !== "approved" && o.authority[1] !== "absent") d.observations.push({ k: "approval-lost", fragment: o.fragment });
  }
  if (d.evidence.testsRemoved.length > 0) d.observations.push({ k: "evidence-removed", tests: d.evidence.testsRemoved });
  const changes = ctx.changes;
  const m = ctx.manifest;
  if (changes === undefined || m === undefined) return;
  const specDir = m.spec.includes("/") ? m.spec.slice(0, m.spec.lastIndexOf("/")) : m.spec;
  const specTouched = changes.some((c) => c === m.spec || under(c, specDir));
  const implTouched = changes.some((c) => m.implementation.some((i) => under(c, i)));
  const evidenceChanged = m.practices.filter((p) => EVIDENCE_KINDS.has(p.kind) && d.inputs.some((i) => i.practice === p.id && i.changed)).map((p) => p.id);
  const testsChanged = m.practices.filter((p) => p.kind === "tests" || p.kind === "scenarios").some((p) => evidenceChanged.includes(p.id));
  if (specTouched && evidenceChanged.length > 0) d.observations.push({ k: "rule-and-evidence-moved-together", practices: sorted(evidenceChanged) });
  if (implTouched && testsChanged) d.observations.push({ k: "implementation-and-tests-changed-together" });
  if (!specTouched) d.observations.push({ k: "spec-untouched" });
}

/** What a change did, from the base's run to the head's. A side that could not be had is never shown as no change. */
export function diffRuns(base: RunSide | Unavailable, head: RunSide | Unavailable, ctx: DiffContext = {}): RunDiff {
  const sideOf = (s: RunSide | Unavailable) => (isUnavailable(s) ? { unavailable: s.unavailable } : { commit: s.run.snapshot.commit, snapshotDigest: s.run.snapshotDigest });
  const present = !isUnavailable(head) ? head : !isUnavailable(base) ? base : undefined;
  const d: RunDiff = {
    schema: "csh-diff/v1",
    component: present?.run.component ?? "",
    comparison: isUnavailable(base) ? "base-unavailable" : isUnavailable(head) ? "head-unavailable" : "made",
    base: sideOf(base),
    head: sideOf(head),
    fragments: { added: [], removed: [], changed: [] },
    obligations: [],
    signals: { appeared: [], cleared: [], persisting: 0 },
    evidence: { testsAdded: [], testsRemoved: [], newlyUnobserved: [] },
    inputs: [],
    gate: [isUnavailable(base) ? "unavailable" : base.gate.overall, isUnavailable(head) ? "unavailable" : head.gate.overall],
    observations: [],
  };
  if (ctx.manifest !== undefined) {
    const model = present?.model;
    d.inputs = ctx.manifest.practices.map((p) => {
      const paths = practicePaths(p, model);
      return { practice: p.id, changed: ctx.changes === undefined ? false : ctx.changes.some((c) => paths.some((x) => under(c, x))) };
    });
  }
  if (isUnavailable(base) || isUnavailable(head)) {
    if (present !== undefined) {
      d.alone = {
        side: present === head ? "head" : "base",
        signals: signalsOf(present.report),
        obligations: (present.report.assessments ?? []).map((a) => ({ fragment: a.fragment, authority: a.authority, verdict: a.verdict, applicability: a.applicability })),
      };
    }
    return d;
  }

  // Fragments.
  const fb = fragmentsOfSide(base);
  const fh = fragmentsOfSide(head);
  d.fragments.added = sorted([...fh.keys()].filter((n) => !fb.has(n)));
  d.fragments.removed = sorted([...fb.keys()].filter((n) => !fh.has(n)));
  for (const n of sorted([...fh.keys()].filter((n) => fb.has(n) && fb.get(n) !== fh.get(n)))) d.fragments.changed.push({ fragment: n, authorityBefore: authorityOf(base, n), authorityAfter: authorityOf(head, n) });

  // Obligations where something moved.
  const ab = new Map((base.report.assessments ?? []).map((a) => [a.fragment, a]));
  const ah = new Map((head.report.assessments ?? []).map((a) => [a.fragment, a]));
  for (const n of sorted([...ab.keys(), ...ah.keys()])) {
    const b = ab.get(n);
    const h = ah.get(n);
    const move: ObligationMove = {
      fragment: n,
      authority: [b?.authority ?? "absent", h?.authority ?? "absent"],
      verdict: [b?.verdict ?? "absent", h?.verdict ?? "absent"],
      applicability: [b?.applicability ?? "absent", h?.applicability ?? "absent"],
      disposition: [b === undefined ? "absent" : dispositionOf(base, n), h === undefined ? "absent" : dispositionOf(head, n)],
    };
    if (h !== undefined && h.reasons.length > 0 && (h.verdict === "unknown" || h.applicability === "stale")) move.reasons = h.reasons;
    if ((["authority", "verdict", "applicability", "disposition"] as const).some((k) => move[k][0] !== move[k][1])) d.obligations.push(move);
  }

  // Signals, matched by id.
  const sb = signalsOf(base.report, ctx.manifest !== undefined ? { sources: Object.fromEntries(ctx.manifest.practices.flatMap((p) => p.sources.map((s) => [s, p.id]))) } : undefined);
  const sh = signalsOf(head.report, ctx.manifest !== undefined ? { sources: Object.fromEntries(ctx.manifest.practices.flatMap((p) => p.sources.map((s) => [s, p.id]))) } : undefined);
  const idsB = new Set(sb.map((s) => s.id));
  const idsH = new Set(sh.map((s) => s.id));
  d.signals.appeared = sh.filter((s) => !idsB.has(s.id));
  d.signals.cleared = sb.filter((s) => !idsH.has(s.id));
  d.signals.persisting = sh.filter((s) => idsB.has(s.id)).length;

  // Evidence.
  const tb = testsOf(base);
  const th = testsOf(head);
  d.evidence.testsAdded = sorted([...th].filter((t) => !tb.has(t)));
  d.evidence.testsRemoved = sorted([...tb].filter((t) => !th.has(t)));
  const unobserved = (r: Report) => new Set(r.gapView.gaps.filter((g) => g.kind === "unobserved-test").map((g) => g.subject));
  const ub = unobserved(base.report);
  d.evidence.newlyUnobserved = sorted([...unobserved(head.report)].filter((s) => !ub.has(s)));

  observe(d, ctx);
  return d;
}
