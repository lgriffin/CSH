// The gap view (Joint evaluation, section 5): who says what about each subject, and
// what is absent. A gap is not a failure.
import {
  bindableTerms,
  collectRefs,
  compareCodePoints,
  type Example,
  type Expr,
  type Fragment,
  INTENT_SOURCE,
  type Invariant,
  MODEL_SOURCE,
  type Module,
  type Requirement,
  type Transition,
} from "@csh/kernel";
import { exampleF, neg, satisfiable, triggerF, unconstrainedAfter, type QueryEnv } from "@csh/solver";
import { outcomeOf } from "@csh/witness";
import type { Prepared } from "./pool.ts";
import { assumptionsFor, type Pool, type QueryOutcome, sourceColumn, stateOfEvent } from "./run.ts";
import type { AuthorityInfo, Cell, Gap, GapView, ReportError } from "./types.ts";

/** Which EARS clauses a pattern carries (Language reference, section 5), for the shape check. */
function clausesOf(pattern: string): { while: boolean; ifClause: boolean } {
  return { while: pattern === "state-driven" || pattern === "complex", ifClause: pattern === "unwanted-behaviour" };
}

const RANK: Cell[] = ["silent", "unliftable", "models", "exemplifies", "asserts"];

function exprsOf(f: Fragment): Expr[] {
  const n = f.node;
  switch (f.kind) {
    case "assumption":
      return [(n as { body: Expr }).body];
    case "invariant":
      return [(n as Invariant).body];
    case "requirement": {
      const r = n as Requirement;
      return [...(r.while !== undefined ? [r.while] : []), ...(r.and !== undefined ? [r.and] : []), r.shall, ...r.ensures];
    }
    case "example": {
      const x = n as Example;
      return [x.then, ...Object.values(x.given), ...Object.values(x.args)];
    }
    case "transition": {
      const t = n as Transition;
      return [t.when, t.then, ...(t.otherwise !== undefined ? [t.otherwise] : [])];
    }
    default:
      return [];
  }
}

/** The gap-view subjects a fragment references: terms, and the event it is about. */
export function subjectsOf(f: Fragment, m: Module): string[] {
  const refs = collectRefs(undefined);
  for (const e of exprsOf(f)) collectRefs(e, refs);
  const s = new Set(bindableTerms(refs));
  const n = f.node as { event?: string; given?: Record<string, unknown>; args?: Record<string, unknown> };
  if (n.event !== undefined && (f.kind === "requirement" || f.kind === "example" || f.kind === "transition")) {
    s.add(n.event);
    const st = stateOfEvent(m.vocabulary, n.event);
    if (f.kind === "example") {
      for (const k of Object.keys(n.given ?? {})) s.add(`${st}.${k}`);
      for (const k of Object.keys(n.args ?? {})) s.add(`${n.event}.args.${k}`);
    }
  }
  return [...s].sort(compareCodePoints);
}

/** Subjects an unliftable text mentions, by vocabulary name. */
function subjectsOfText(text: string, m: Module): string[] {
  const out = new Set<string>();
  const words = new Set(text.match(/[A-Za-z_][A-Za-z0-9_.]*/g) ?? []);
  for (const e of m.vocabulary.events) {
    if (words.has(e.name)) out.add(e.name);
    for (const a of Object.keys(e.args)) if (words.has(`${e.name}.args.${a}`)) out.add(`${e.name}.args.${a}`);
  }
  for (const s of m.vocabulary.states) for (const f of Object.keys(s.fields)) if (words.has(`${s.name}.${f}`)) out.add(`${s.name}.${f}`);
  return [...out].sort(compareCodePoints);
}

export interface GapInput {
  prepared: Prepared;
  pool: Pool;
  outcome: QueryOutcome;
  env: QueryEnv;
  authority: Map<string, AuthorityInfo>;
  /** Sources no practice of the component manifest names (Anchor, harnesses and A3, section 2.1). */
  unowned?: string[];
}

export async function gapView(input: GapInput): Promise<{ view: GapView; errors: ReportError[] }> {
  const { prepared, pool, env } = input;
  const m = prepared.module;
  const v = m.vocabulary;
  const live = prepared.fragments.filter((f) => pool.byName.has(f.name));
  const sources = [INTENT_SOURCE, ...m.sources.map((s) => s.name).sort(compareCodePoints), ...(m.transitions.length > 0 ? [MODEL_SOURCE] : [])];
  const gaps: Gap[] = [];
  const errors: ReportError[] = [];

  // Rows.
  const subjects: string[] = [];
  for (const s of v.states) for (const f of Object.keys(s.fields).sort(compareCodePoints)) subjects.push(`${s.name}.${f}`);
  for (const e of v.events) {
    subjects.push(e.name);
    for (const a of Object.keys(e.args).sort(compareCodePoints)) subjects.push(`${e.name}.args.${a}`);
    if (e.returns !== undefined) subjects.push(`${e.name}.result`);
  }
  const obligations = live.filter((f) => ["invariant", "requirement", "architecture", "temporal"].includes(f.kind));
  const cells = new Map<string, Record<string, Cell>>();
  for (const s of [...subjects, ...obligations.map((o) => o.name)]) cells.set(s, Object.fromEntries(sources.map((c) => [c, "silent" as Cell])));
  const mark = (subject: string, source: string, value: Cell) => {
    const row = cells.get(subject);
    if (row === undefined || !(source in row)) return;
    if (RANK.indexOf(value) > RANK.indexOf(row[source]!)) row[source] = value;
  };
  const cellOf = (f: Fragment): Cell | undefined => (f.kind === "invariant" || f.kind === "requirement" ? "asserts" : f.kind === "example" ? "exemplifies" : f.kind === "transition" ? "models" : undefined);
  const subj = new Map(live.map((f) => [f.name, subjectsOf(f, m)]));
  for (const f of live) {
    const c = cellOf(f);
    if (c === undefined) continue;
    for (const s of subj.get(f.name)!) mark(s, f.source, c);
  }
  // Obligation rows: who asserts, exemplifies or models what the obligation is about.
  const scopeOf = (o: Fragment): { state: string; events: string[] } => {
    const n = o.node as Invariant | Requirement;
    if (n.kind === "requirement") return { state: stateOfEvent(v, n.event), events: [n.event] };
    if (n.kind === "invariant") return { state: n.state, events: v.events.filter((e) => e.on === n.state).map((e) => e.name) };
    return { state: "", events: [] };
  };
  for (const o of obligations) {
    mark(o.name, o.source, "asserts");
    const sc = scopeOf(o);
    for (const f of live) {
      const ev = (f.node as { event?: string }).event;
      if (f.kind === "example" && ev !== undefined && sc.events.includes(ev)) mark(o.name, f.source, "exemplifies");
      if (f.kind === "transition" && ev !== undefined && sc.events.includes(ev)) mark(o.name, f.source, "models");
    }
  }
  // Unliftable content.
  for (const u of prepared.unliftable) {
    const ss = subjectsOfText(u.text, m);
    for (const s of ss) mark(s, u.source, "unliftable");
    for (const o of obligations) if (scopeOf(o).events.some((e) => ss.includes(e))) mark(o.name, u.source, "unliftable");
    gaps.push({ kind: "unliftable", subject: ss[0] ?? u.source, fragments: [], detail: `${u.source} ${u.span}: ${u.reason}${ss.length > 1 ? ` (also ${ss.slice(1).join(", ")})` : ""}` });
  }

  // unconstrained-after, decided by a query per transition, branch and field.
  for (const t of pool.transitions) {
    const st = stateOfEvent(v, t.event);
    if (pool.invariants.some((i) => i.state === st && input.outcome.skipped.get(i.id) === "state-conflict")) continue;
    const as = assumptionsFor(pool, { state: st, event: t.event });
    const invs = pool.invariants.filter((i) => i.state === st);
    const r = await unconstrainedAfter(env, t, as, invs);
    if (r.status === "unknown") {
      gaps.push({ kind: "unconstrained-after", subject: t.id, fragments: [t.id], detail: `unknown: ${r.reason}` });
      continue;
    }
    for (const g of r.gaps) gaps.push({ kind: "unconstrained-after", subject: `${st}.${g.field}`, fragments: [t.id], detail: `${g.branch} branch of ${t.id}${g.branch === "otherwise" && t.otherwise === undefined ? " (no otherwise clause)" : ""}` });
  }

  // no-example and no-rule: does an example's given and args make a requirement's trigger true?
  const meets = new Map<string, Set<string>>(); // requirement -> examples meeting its trigger
  for (const r of pool.requirements) {
    const hits = new Set<string>();
    for (const x of pool.examples.filter((x) => x.event === r.event)) {
      const givenArgs = exampleF({ ...x, then: { k: "bool", v: true } }, v);
      const s = await satisfiable(env, [givenArgs, neg(triggerF(r))]);
      if (s === "unsat") hits.add(x.id);
    }
    meets.set(r.id, hits);
    if (hits.size === 0) gaps.push({ kind: "no-example", subject: r.id, fragments: [r.id], detail: `no example on ${r.event} makes its trigger true` });
  }
  for (const x of pool.examples) {
    const rules = pool.requirements.filter((r) => meets.get(r.id)?.has(x.id));
    if (rules.length === 0) gaps.push({ kind: "no-rule", subject: x.id, fragments: [x.id], detail: `no requirement on ${x.event} has a trigger this example meets` });
  }

  // single-source: every subject of the obligation is asserted by one source only.
  for (const o of obligations.filter((o) => o.kind === "invariant" || o.kind === "requirement")) {
    const terms = subj.get(o.name)!.filter((s) => s.includes("."));
    const asserting = new Set<string>();
    for (const f of live) {
      if (f.kind !== "invariant" && f.kind !== "requirement") continue;
      if (subj.get(f.name)!.some((s) => terms.includes(s))) asserting.add(sourceColumn(f));
    }
    if (asserting.size === 1) gaps.push({ kind: "single-source", subject: o.name, fragments: [o.name], detail: `${terms.join(", ")} asserted only by ${[...asserting][0]}` });
  }

  // uncited items, dangling citations and shape mismatches (Evidence tab, section 6).
  const cited = new Set<string>();
  const readSources = new Set(prepared.runs.filter((r) => r.files.length > 0).map((r) => r.source));
  for (const f of live) {
    for (const c of f.cites) {
      cited.add(`${c.source}/${c.id}`);
      const item = prepared.items.find((i) => i.source === c.source && i.id === c.id);
      if (item === undefined) {
        if (readSources.has(c.source)) errors.push({ code: "dangling-citation", severity: "error", detail: `${f.name} cites ${c.source}/${c.id}, which does not exist`, fragment: f.name, source: c.source });
        else errors.push({ code: "citation-unverified", severity: "warning", detail: `${f.name} cites ${c.source}/${c.id}, but ${c.source} could not be read`, fragment: f.name, source: c.source });
        continue;
      }
      if (f.kind === "requirement" && item.pattern !== undefined && item.pattern !== "none") {
        const r = f.node as Requirement;
        const want = clausesOf(item.pattern);
        if (want.while !== (r.while !== undefined)) errors.push({ code: "shape-mismatch", severity: "warning", detail: `${c.source}/${c.id} is ${item.pattern}${want.while ? " with" : " without"} a while clause; ${f.name} has${r.while !== undefined ? "" : " no"} while`, fragment: f.name, source: c.source, span: item.span });
        if (want.ifClause && r.and === undefined) errors.push({ code: "shape-mismatch", severity: "warning", detail: `${c.source}/${c.id} is ${item.pattern} with an if-clause; ${f.name} has no and`, fragment: f.name, source: c.source, span: item.span });
      }
    }
  }
  for (const it of prepared.items) if (!cited.has(`${it.source}/${it.id}`)) gaps.push({ kind: "uncited", subject: `${it.source}/${it.id}`, fragments: [], detail: `${it.span}: no fragment cites it` });

  // unbound: a term an approved obligation references has no binding at all.
  const bound = new Set(m.bindings.map((b) => (b.target.k === "field" ? `${b.target.state}.${b.target.field}` : b.target.k === "arg" ? `${b.target.event}.args.${b.target.name}` : `${b.target.event}.result`)));
  const unbound = new Map<string, string[]>();
  for (const o of obligations) {
    if (input.authority.get(o.name)?.authority !== "approved") continue;
    for (const t of subj.get(o.name)!.filter((s) => s.includes(".") && !bound.has(s))) unbound.set(t, [...(unbound.get(t) ?? []), o.name]);
  }
  for (const [t, fs] of [...unbound.entries()].sort((a, b) => compareCodePoints(a[0], b[0]))) gaps.push({ kind: "unbound", subject: t, fragments: fs, detail: `referenced by ${fs.join(", ")}` });

  // reserved and relaxed.
  for (const o of obligations.filter((o) => o.kind === "architecture" || o.kind === "temporal")) gaps.push({ kind: "reserved", subject: o.name, fragments: [o.name], detail: `${o.kind} obligations cannot be evaluated in version 1` });
  for (const r of m.relaxations ?? []) gaps.push({ kind: "relaxed", subject: r.obligation, fragments: [r.obligation], detail: `relaxed by ${r.owner}: ${r.reason}` });

  // unowned-source: a source the specification declares that no practice of the component names.
  for (const s of input.unowned ?? []) gaps.push({ kind: "unowned-source", subject: s, fragments: [], detail: `no practice in the component manifest names source ${s}` });

  const rows = [...cells.entries()].map(([subject, c]) => ({ subject, cells: c }));
  // outcome-unknown: a witness whose test has no outcome, stated or joined, is never a claim (section 3.2).
  // unobserved-test: a test that finished and recorded no witness says nothing to the harness.
  const unknown = new Map<string, string[]>();
  const observed = new Set<string>();
  for (const w of prepared.witnesses) {
    const test = w.witness.execution.test;
    if (test !== undefined) observed.add(`${w.source}\u0000${test}`);
    if (outcomeOf(w.witness) !== "unknown") continue;
    const subject = test ?? w.witness.id;
    unknown.set(subject, [...(unknown.get(subject) ?? []), `${w.source} ${w.span ?? w.witness.id}`]);
  }
  for (const [subject, at] of unknown) gaps.push({ kind: "outcome-unknown", subject, fragments: [], detail: `${at.join(", ")}: no execution line gives this test's outcome, so its witnesses are not claims` });
  const unobserved = new Map<string, string>();
  for (const e of prepared.executions) if (!observed.has(`${e.source}\u0000${e.test}`) && !unobserved.has(e.test)) unobserved.set(e.test, `${e.span}: ${e.outcome}, and no witness from ${e.source}`);
  for (const [subject, detail] of unobserved) gaps.push({ kind: "unobserved-test", subject, fragments: [], detail });

  const order = ["unliftable", "unconstrained-after", "no-example", "no-rule", "single-source", "uncited", "unbound", "reserved", "relaxed", "unowned-source", "outcome-unknown", "unobserved-test"];
  gaps.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || compareCodePoints(a.subject, b.subject) || compareCodePoints(a.detail ?? "", b.detail ?? ""));
  return { view: { sources, rows, gaps }, errors };
}

