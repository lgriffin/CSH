// The A3 model (Anchor, harnesses and A3, section 5.2): every number is counted from the stage records and every
// judgment comes from the judgments file. Nothing here reads the clock, a commit hash or the ledger; authority and
// file contents at a commit arrive as inputs, so the same inputs always give the same model.
import { matches, type Match, type Report, type Signal, signalsOf } from "@csh/check";
import type { Practice } from "@csh/component";
import { A3_SCHEMA, type A3Model, type Authority, type CountermeasureStatus, type Judgments, type Pointer, type Problem, type SheetSignal, type SheetStage, type StageRecord } from "./types.ts";
import { measureValues } from "./measures.ts";

export interface BuildInput {
  slug: string;
  judgments: Judgments;
  /** Digest of the judgments file's bytes. */
  judgmentsDigest: string;
  /** The component's name and practices, from its manifest. */
  component: { name: string; practices: Practice[] };
  /** Stage records by id; a stage the judgments list and this lacks is a problem, not an error. */
  stages: StageRecord[];
  authority: Authority;
  /**
   * The text of a component file as it stood at a stage's commit: a string, undefined when the file is absent, or
   * null when the commit cannot be read. Without it, every file pointer is unresolved.
   */
  readAt?: (stage: StageRecord, file: string) => string | undefined | null;
}

const short = (name: string) => name.split("/").pop() ?? name;
const anyMatch = (s: Signal, ms: Match[]) => ms.some((m) => matches(s, m));

/** The line a sheet prints for a signal. */
export function labelOf(s: Signal, report: Report): string {
  const names = s.fragments.map(short);
  if ((report.findings ?? []).some((f) => f.id === s.id && f.kind === s.kind)) return `${s.kind} ${s.id}: ${names.join(" × ")}`;
  if (s.kind === "not-comparable") return `not comparable: ${names[0]} (${s.detail})`;
  if (s.kind === "violated") return `violated: ${names[0]} (${s.detail})`;
  if (s.subject !== undefined && (report.gapView?.gaps ?? []).some((g) => g.kind === s.kind && g.subject === s.subject)) {
    return `${s.kind}: ${short(s.subject)}${s.kind === "unliftable" ? ` (${(s.detail ?? "").split(": ").pop()})` : ""}`;
  }
  return `${s.kind}: ${s.detail ?? ""}`;
}

function sheetStage(j: Judgments, rec: StageRecord, def: Judgments["stages"][number], practices: Practice[]): SheetStage {
  const sources: Record<string, string> = {};
  for (const p of practices) for (const s of p.sources) sources[s] = p.id;
  const report = rec.report;
  const signals: SheetSignal[] = signalsOf(report, practices.length > 0 ? { sources } : undefined).map((s) => {
    const cause = j.causes.find((c) => anyMatch(s, c.match));
    const lane = j.lanes.find((l) => anyMatch(s, l.match));
    return { ...s, label: labelOf(s, report), ...(cause !== undefined ? { cause: cause.id } : {}), ...(lane !== undefined ? { lane: lane.id } : {}) };
  });
  const execs = report.executions ?? [];
  const disposition = new Map((rec.gate.obligations ?? []).map((o) => [o.fragment, o.disposition]));
  const owned = new Set(Object.keys(Object.keys(sources).length > 0 ? sources : (report.component?.sources ?? {})));
  const items = new Set((report.items ?? []).map((i) => `${i.source}/${i.id}`));
  const examples = (report.examples ?? []).filter((e) => owned.has(e.source));
  return {
    id: def.id,
    name: def.name,
    what: def.what,
    tests: { passed: execs.filter((e) => e.localResult === "passed").length, total: execs.length },
    gate: { mode: rec.gate.mode, overall: rec.gate.overall },
    signals,
    conflicts: signals.filter((s) => s.kind.endsWith("-conflict")).length,
    rules: (report.assessments ?? []).map((a) => ({ fragment: a.fragment, name: short(a.fragment), verdict: a.verdict, authority: a.authority, selfApproved: a.selfApproved === true, disposition: disposition.get(a.fragment) ?? "candidate" })),
    examples: { total: examples.length, citing: examples.filter((e) => e.cites.some((c) => items.has(c))).length },
  };
}

/** The Pareto of one stage's signals by cause; signals no cause places form their own bar, never dropped. */
export function pareto(st: SheetStage, j: Judgments): A3Model["pareto"][number]["bars"] {
  const counts = j.causes.map((c) => ({ cause: c.id, name: c.name, n: st.signals.filter((s) => s.cause === c.id).length }));
  const unclassified = st.signals.filter((s) => s.cause === undefined).length;
  if (unclassified > 0) counts.push({ cause: "", name: "Unclassified: no cause places it", n: unclassified });
  const sorted = counts.filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
  const total = sorted.reduce((t, c) => t + c.n, 0);
  let run = 0;
  let crossed = false;
  return sorted.map((c) => {
    const vital = !crossed;
    run += c.n;
    if (run / total >= 0.8) crossed = true;
    return { ...c, cumulative: run / total, vital };
  });
}

function status(cm: Judgments["countermeasures"][number], stages: SheetStage[], measures: A3Model["measures"]): CountermeasureStatus {
  if (cm.stage !== undefined) {
    const st = stages.find((s) => s.id === cm.stage);
    return st !== undefined && st.gate.mode === "enforcing" && st.gate.overall === "allow" ? "verified" : "proposed";
  }
  if (cm.clears !== undefined && stages.length > 0) {
    const has = (st: SheetStage) => st.signals.some((s) => anyMatch(s, cm.clears!));
    if (!has(stages[0]!)) return "nothing to clear";
    return stages.slice(1).some((st) => !has(st)) ? "verified" : "not cleared";
  }
  if (cm.expects !== undefined) return stages.some((st) => st.signals.some((s) => anyMatch(s, cm.expects!))) ? "verified" : "proposed";
  if (cm.measure !== undefined) {
    const m = measures.find((x) => x.id === cm.measure);
    return m !== undefined && m.values.length > 0 && m.values[m.values.length - 1]!.met ? "verified" : "proposed";
  }
  return cm.kind === "scope" ? "owner decides" : "proposed";
}

/** Build the A3 model from its two inputs. */
export function buildA3(input: BuildInput): A3Model {
  const j = input.judgments;
  const problems: Problem[] = [];
  const practices = input.component.practices;
  const records = new Map(input.stages.map((s) => [s.id, s]));
  const stages: SheetStage[] = [];
  for (const def of j.stages) {
    const rec = records.get(def.id);
    if (rec === undefined) {
      problems.push({ kind: "missing-stage", subject: def.id, detail: `no stage record under stages/${def.id}; add it with csh a3 stage` });
      continue;
    }
    stages.push(sheetStage(j, rec, def, practices));
  }

  // Checks on the judgments (section 5.5). The builder reports them and never repairs them.
  for (const st of stages) for (const s of st.signals) if (s.cause === undefined) problems.push({ kind: "unclassified", subject: s.label, detail: "no cause places this signal", stage: st.id });
  const placing: [string, Match[]][] = [...j.lanes.map((l): [string, Match[]] => [`lane ${l.id}`, l.match]), ...j.causes.map((c): [string, Match[]] => [`cause ${c.id}`, c.match]), ...j.decisionPoints.map((d): [string, Match[]] => [`decision point "${d.point}"`, d.match])];
  for (const [where, rules] of placing) {
    for (const m of rules) {
      if (!stages.some((st) => st.signals.some((s) => matches(s, m)))) problems.push({ kind: "dead-rule", subject: `${where}: ${JSON.stringify(m)}`, detail: "places no signal at any stage" });
    }
  }
  const ids = new Set(practices.map((p) => p.id));
  if (practices.length > 0) {
    for (const l of j.lanes) if (l.practice !== "hub" && !ids.has(l.practice)) problems.push({ kind: "unknown-practice", subject: `lane ${l.id}`, detail: `names practice ${l.practice}, which the manifest lacks` });
    for (const d of j.decisionPoints) for (const p of Object.keys(d.says)) if (!ids.has(p)) problems.push({ kind: "unknown-practice", subject: `decision point "${d.point}"`, detail: `names practice ${p}, which the manifest lacks` });
    for (const p of Object.keys(j.cannotSay)) if (!ids.has(p)) problems.push({ kind: "unknown-practice", subject: "cannotSay", detail: `names practice ${p}, which the manifest lacks` });
  }
  const answered = new Set(j.countermeasures.flatMap((c) => c.answers));
  for (const q of j.rca) if (!answered.has(q.id)) problems.push({ kind: "unanswered", subject: q.id, detail: `no countermeasure answers "${q.q}"` });
  for (const c of j.countermeasures) {
    if (c.clears === undefined && c.expects === undefined && c.stage === undefined && c.measure === undefined && c.kind !== "scope" && c.kind !== "process") {
      problems.push({ kind: "unverifiable", subject: c.id, detail: "names no signal it clears or expects, no stage and no measure, and is not a scope or process countermeasure" });
    }
  }

  const resolve = (p: Pointer | undefined, where: string): (Pointer & { resolves: boolean }) | undefined => {
    if (p === undefined) return undefined;
    let resolves = false;
    let why = "";
    if ("finding" in p) {
      const rec = records.get(p.stage);
      resolves = rec !== undefined && (rec.report.findings ?? []).some((f) => f.id === p.finding);
      why = rec === undefined ? `stage ${p.stage} has no record` : `no finding ${p.finding} at stage ${p.stage}`;
    } else {
      const sid = p.stage ?? j.stages[0]?.id;
      const rec = sid === undefined ? undefined : records.get(sid);
      const text = rec === undefined || input.readAt === undefined ? null : input.readAt(rec, p.file);
      resolves = typeof text === "string" && text.includes(p.text);
      why = rec === undefined ? `stage ${sid ?? "(none)"} has no record` : text === null ? `${p.file} cannot be read at stage ${sid}'s commit` : text === undefined ? `${p.file} does not exist at stage ${sid}` : `${p.file} at stage ${sid} lacks the quoted text`;
    }
    if (!resolves) problems.push({ kind: "dangling-pointer", subject: where, detail: why });
    return { ...p, resolves };
  };

  const measures = measureValues(stages, j);
  const last = stages[stages.length - 1];
  const first = stages[0];
  const returned =
    first === undefined || last === undefined || stages.length < 3
      ? []
      : first.signals.filter((s) => last.signals.some((x) => x.id === s.id) && stages.slice(1, -1).some((st) => !st.signals.some((x) => x.id === s.id))).map((s) => s.label);
  const cannot = j.cannotSay;
  const model: A3Model = {
    schema: A3_SCHEMA,
    slug: input.slug,
    component: input.component.name,
    judgmentsDigest: input.judgmentsDigest,
    authority: input.authority,
    title: j.title,
    problem: j.problem,
    background: j.background,
    practices: practices.map((p) => ({ id: p.id, name: p.name, kind: p.kind, ...(p.author !== undefined ? { author: p.author } : {}), ...(p.unit !== undefined ? { unit: p.unit } : {}), sources: [...p.sources], ...(cannot[p.id] !== undefined ? { cannotSay: cannot[p.id]! } : {}) })),
    stages,
    lanes: j.lanes.map((l) => ({ id: l.id, practice: l.practice, step: l.step, title: l.title, where: l.where, counts: stages.map((st) => st.signals.filter((s) => s.lane === l.id).length) })),
    pareto: stages.map((st) => ({ stage: st.id, bars: pareto(st, j) })),
    decisionPoints: j.decisionPoints.map((d) => ({ point: d.point, class: d.class, says: d.says, ...(d.note !== undefined ? { note: d.note } : {}), signals: stages.map((st) => st.signals.filter((s) => anyMatch(s, d.match)).map((s) => s.id)) })),
    goal: j.goal,
    measures,
    rca: j.rca.map((q) => {
      const ev = resolve(q.evidence, `${q.id} evidence`);
      return { id: q.id, q: q.q, a: q.a, ...(ev !== undefined ? { evidence: ev } : {}), depth: q.depth };
    }),
    whys: j.whys.map((w, i) => {
      const ev = resolve(w.evidence, `why ${i + 1} evidence`);
      return { q: w.q, a: w.a, ...(ev !== undefined ? { evidence: ev } : {}), ...(w.root !== undefined ? { root: w.root } : {}) };
    }),
    countermeasures: j.countermeasures.map((c) => ({ id: c.id, kind: c.kind, what: c.what, answers: c.answers, status: status(c, stages, measures) })),
    plan: j.plan,
    followUp: { gate: last?.gate ?? { mode: "advisory", overall: "none" }, returned },
    terms: j.terms ?? [],
    problems,
  };
  return model;
}
