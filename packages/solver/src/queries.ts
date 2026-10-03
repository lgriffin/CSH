// The six named queries of the Semantic contract (section 4), minimal conflicting
// sets (Joint evaluation, section 4) and the unconstrained-after query (section 5).
import type { Expr, Vocabulary } from "@csh/kernel";
import { all, any, ex, type F, type Frame, fieldVar, imp, neg, POST, PRE, resultVar, STATE, varsOf } from "./formula.ts";
import type { CheckResult, SolverPort, Tracked } from "./port.ts";

export interface QAssumption {
  id: string;
  body: Expr;
}
export interface QInvariant {
  id: string;
  state: string;
  body: Expr;
}
export interface QRequirement {
  id: string;
  event: string;
  while?: Expr;
  and?: Expr;
  shall: Expr;
  ensures: Expr[];
}
export interface QExample {
  id: string;
  event: string;
  given: Record<string, Expr>;
  args: Record<string, Expr>;
  then: Expr;
}
export interface QTransition {
  id: string;
  event: string;
  when: Expr;
  then: Expr;
  otherwise?: Expr;
}

export interface MinimalSet {
  /** Member ids, sorted. */
  members: string[];
  /** Terms referenced by at least two member instances. */
  collisionTerms: string[];
  /** For a satisfiable failing query: the solver's values, integers as decimal strings. */
  witness?: Record<string, string>;
}

export type QueryResult =
  | { status: "wanted" }
  | { status: "failed"; sets: MinimalSet[]; incomplete: boolean; context: string[] }
  | { status: "unknown"; reason: string };

export const MAX_SETS = 16;

/** One query's time budget, shared by every solver call the query makes. */
export class Budget {
  private readonly deadline: number;
  readonly totalMs: number;
  constructor(totalMs: number, now: () => number = () => performance.now()) {
    this.totalMs = totalMs;
    this.now = now;
    this.deadline = now() + totalMs;
  }
  private readonly now: () => number;
  remaining(): number {
    if (!(this.totalMs > 0)) return 0;
    return Math.max(0, this.deadline - this.now());
  }
}

class Unknown extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

export interface QueryEnv {
  solver: SolverPort;
  vocabulary: Vocabulary;
  budgetMs: number;
}

async function run(env: QueryEnv, budget: Budget, hard: F[], tracked: Tracked[]): Promise<CheckResult> {
  const timeoutMs = budget.remaining();
  if (timeoutMs <= 0) throw new Unknown("solver-timeout");
  let r: CheckResult;
  try {
    r = await env.solver.check({ vocabulary: env.vocabulary, hard, tracked, timeoutMs });
  } catch (err) {
    throw new Unknown(`solver-error: ${(err as Error).message}`);
  }
  if (r === undefined || r === null || (r.status !== "sat" && r.status !== "unsat" && r.status !== "unknown")) {
    throw new Unknown("solver-error: malformed answer");
  }
  if (r.status === "unknown") throw new Unknown(r.reason ?? "solver-unknown");
  return r;
}

// ------------------------------------------------------------------ formulas

export const assumptionF = (a: QAssumption, frame: Frame = PRE): F => ex(a.body, frame);
export const invariantF = (i: QInvariant, frame: Frame): F => ex(i.body, frame);
export function triggerF(r: QRequirement): F {
  const parts: F[] = [];
  if (r.while !== undefined) parts.push(ex(r.while, PRE));
  if (r.and !== undefined) parts.push(ex(r.and, PRE));
  return all(parts);
}
export function requirementF(r: QRequirement, frame: Frame = PRE): F {
  return imp(triggerF(r), all([ex(r.shall, frame), ...r.ensures.map((x) => ex(x, frame))]));
}
export function transitionF(t: QTransition, frame: Frame = PRE): F {
  const when = ex(t.when, frame);
  if (t.otherwise === undefined) return imp(when, ex(t.then, frame));
  return any([all([when, ex(t.then, frame)]), all([neg(when), ex(t.otherwise, frame)])]);
}
export function exampleF(x: QExample, vocab: Vocabulary): F {
  const ev = vocab.events.find((e) => e.name === x.event);
  const parts: F[] = [];
  for (const [f, lit] of Object.entries(x.given)) {
    if (ev !== undefined) parts.push(ex({ k: "eq", l: { k: "field", state: ev.on, field: f, at: "pre" }, r: lit }, PRE));
  }
  for (const [a, lit] of Object.entries(x.args)) parts.push(ex({ k: "eq", l: { k: "arg", event: x.event, name: a }, r: lit }, PRE));
  parts.push(ex(x.then, PRE));
  return all(parts);
}

/** Post-state constants and the result of an event: what Q-FEAS quantifies over. */
export function outcomeVars(event: string, vocab: Vocabulary, frame: Frame = PRE): string[] {
  const ev = vocab.events.find((e) => e.name === event);
  if (ev === undefined) return [];
  const st = vocab.states.find((s) => s.name === ev.on);
  const vars = Object.keys(st?.fields ?? {}).map((f) => fieldVar(ev.on, f, frame.post));
  if (ev.returns !== undefined) vars.push(resultVar(event, frame.result));
  return vars.sort();
}

// ------------------------------------------------------------------ minimal sets

type ConflictTest = (subset: string[]) => Promise<{ conflict: boolean; core?: string[]; model?: Record<string, string> }>;

/**
 * Enumerate minimal conflicting subsets of `items`: shrink by deletion, then
 * block each set found (at least one member absent) and repeat, up to `limit`.
 */
export async function enumerateMinimal(
  items: string[],
  test: ConflictTest,
  limit = MAX_SETS,
): Promise<{ sets: { members: string[]; model?: Record<string, string> }[]; incomplete: boolean }> {
  const sorted = [...items].sort();
  const found: { members: string[]; model?: Record<string, string> }[] = [];
  const queue: string[][] = [sorted];
  const seen = new Set<string>();
  let incomplete = false;
  while (queue.length > 0) {
    const seed = queue.shift()!;
    const key = seed.join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    const contained = found.find((f) => f.members.every((m) => seed.includes(m)));
    if (contained !== undefined) {
      for (const m of contained.members) queue.push(seed.filter((x) => x !== m));
      continue;
    }
    const first = await test(seed);
    if (!first.conflict) continue;
    if (found.length >= limit) {
      incomplete = true;
      break;
    }
    // Start from the core when the solver supplied one, then shrink by deletion.
    let cur = first.core !== undefined && first.core.length > 0 ? seed.filter((x) => first.core!.includes(x)) : seed;
    if (cur !== seed) {
      const ok = await test(cur);
      if (!ok.conflict) cur = seed;
    }
    let model = first.model;
    for (const m of [...cur]) {
      const trial = cur.filter((x) => x !== m);
      const r = await test(trial);
      if (r.conflict) {
        cur = trial;
        if (r.model !== undefined) model = r.model;
      }
    }
    if (model !== undefined) {
      const confirm = await test(cur);
      if (confirm.model !== undefined) model = confirm.model;
    }
    const entry: { members: string[]; model?: Record<string, string> } = { members: cur };
    if (model !== undefined) entry.model = model;
    found.push(entry);
    for (const m of cur) queue.push(seed.filter((x) => x !== m));
  }
  return { sets: found, incomplete };
}

function collisionTerms(instances: F[]): string[] {
  const counts = new Map<string, number>();
  for (const f of instances) for (const v of varsOf(f)) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([v]) => v).sort();
}

interface Inst {
  /** Instance id, unique within the query. */
  iid: string;
  /** The fragment it instantiates. */
  member: string;
  f: F;
}

async function unsatSets(env: QueryEnv, budget: Budget, hard: F[], insts: Inst[], extraMembers: string[] = [], extraForTerms: F[] = []): Promise<{ sets: MinimalSet[]; incomplete: boolean }> {
  const byId = new Map(insts.map((i) => [i.iid, i]));
  const test: ConflictTest = async (subset) => {
    const r = await run(env, budget, hard, subset.map((id) => ({ id, f: byId.get(id)!.f })));
    return r.status === "unsat" ? { conflict: true, core: r.core ?? [] } : { conflict: false };
  };
  const res = await enumerateMinimal(insts.map((i) => i.iid), test);
  const sets: MinimalSet[] = [];
  const keys = new Set<string>();
  for (const s of res.sets) {
    const members = [...new Set([...s.members.map((id) => byId.get(id)!.member), ...extraMembers])].sort();
    const key = members.join("\u0000");
    if (keys.has(key)) continue;
    keys.add(key);
    sets.push({ members, collisionTerms: collisionTerms([...s.members.map((id) => byId.get(id)!.f), ...extraForTerms]) });
  }
  return { sets, incomplete: res.incomplete };
}

async function guarded(fn: () => Promise<QueryResult>): Promise<QueryResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Unknown) return { status: "unknown", reason: err.reason };
    return { status: "unknown", reason: `solver-error: ${(err as Error).message}` };
  }
}

// ------------------------------------------------------------------ the queries

/** Q-STATE: A and I(s) satisfiable. */
export function qState(env: QueryEnv, assumptions: QAssumption[], invariants: QInvariant[]): Promise<QueryResult> {
  return guarded(async () => {
    const budget = new Budget(env.budgetMs);
    // Assumptions that contradict each other on their own are the conflict, and are named as its members.
    if (assumptions.length > 0) {
      const asInsts = assumptions.map((a) => ({ iid: a.id, member: a.id, f: assumptionF(a, STATE) }));
      const alone = await run(env, budget, [], asInsts.map((i) => ({ id: i.iid, f: i.f })));
      if (alone.status === "unsat") {
        const { sets, incomplete } = await unsatSets(env, budget, [], asInsts);
        return { status: "failed", sets, incomplete, context: [] };
      }
    }
    if (invariants.length === 0) return { status: "wanted" };
    const hard = assumptions.map((a) => assumptionF(a, STATE));
    const insts = invariants.map((i) => ({ iid: i.id, member: i.id, f: invariantF(i, STATE) }));
    const r = await run(env, budget, hard, insts.map((i) => ({ id: i.iid, f: i.f })));
    if (r.status === "sat") return { status: "wanted" };
    const { sets, incomplete } = await unsatSets(env, budget, hard, insts);
    return { status: "failed", sets, incomplete, context: assumptions.map((a) => a.id).sort() };
  });
}

/** Q-VAC(R): A and I(s) and trigger of R satisfiable. Context: the assumptions and invariants that exclude the trigger. */
export function qVac(env: QueryEnv, r: QRequirement, assumptions: QAssumption[], invariants: QInvariant[]): Promise<QueryResult> {
  return guarded(async () => {
    const budget = new Budget(env.budgetMs);
    const hard = [triggerF(r)];
    const insts: Inst[] = [
      ...assumptions.map((a) => ({ iid: a.id, member: a.id, f: assumptionF(a) })),
      ...invariants.map((i) => ({ iid: i.id, member: i.id, f: invariantF(i, PRE) })),
    ];
    const first = await run(env, budget, hard, insts.map((i) => ({ id: i.iid, f: i.f })));
    if (first.status === "sat") return { status: "wanted" };
    const { sets, incomplete } = await unsatSets(env, budget, hard, insts);
    const context = sets[0]?.members ?? [];
    return { status: "failed", sets: [{ members: [r.id], collisionTerms: [] }], incomplete, context: incomplete ? context : [...new Set(sets.flatMap((s) => s.members))].sort() };
  });
}

/**
 * Q-FEAS(e): exists s, a: A and I(s) and, for all s', r: not (R and I(s')).
 * Wanted unsatisfiable. Minimised over the requirements and invariants in the quantified body.
 */
export function qFeas(env: QueryEnv, event: string, assumptions: QAssumption[], invariants: QInvariant[], requirements: QRequirement[]): Promise<QueryResult> {
  return guarded(async () => {
    if (requirements.length === 0) return { status: "wanted" };
    const budget = new Budget(env.budgetMs);
    const outer = [...assumptions.map((a) => assumptionF(a)), ...invariants.map((i) => invariantF(i, PRE))];
    const qv = outcomeVars(event, env.vocabulary);
    const bodyOf = (ids: string[]): F[] => [
      ...requirements.filter((r) => ids.includes(r.id)).map((r) => requirementF(r)),
      ...invariants.filter((i) => ids.includes(i.id)).map((i) => invariantF(i, POST)),
    ];
    const formula = (ids: string[]): F => ({ op: "forall", vars: qv, body: neg(all(bodyOf(ids))) });
    const test: ConflictTest = async (subset) => {
      const r = await run(env, budget, [...outer, formula(subset)], []);
      return r.status === "sat" ? (r.model !== undefined ? { conflict: true, model: r.model } : { conflict: true }) : { conflict: false };
    };
    const items = [...requirements.map((r) => r.id), ...invariants.map((i) => i.id)];
    const first = await test(items);
    if (!first.conflict) return { status: "wanted" };
    const res = await enumerateMinimal(items, test);
    const sets: MinimalSet[] = res.sets.map((s) => {
      const set: MinimalSet = { members: [...s.members].sort(), collisionTerms: collisionTerms(bodyOf(s.members)) };
      if (s.model !== undefined) set.witness = s.model;
      return set;
    });
    return { status: "failed", sets, incomplete: res.incomplete, context: assumptions.map((a) => a.id).sort() };
  });
}

/** Q-EX(E): given, args and then of E with A, I(s), R and I(s') satisfiable. */
export function qEx(env: QueryEnv, x: QExample, assumptions: QAssumption[], invariants: QInvariant[], requirements: QRequirement[]): Promise<QueryResult> {
  return guarded(async () => {
    const budget = new Budget(env.budgetMs);
    const hardBase = assumptions.map((a) => assumptionF(a));
    const xf = exampleF(x, env.vocabulary);
    const insts: Inst[] = [
      ...invariants.map((i) => ({ iid: `${i.id}@pre`, member: i.id, f: invariantF(i, PRE) })),
      ...invariants.map((i) => ({ iid: `${i.id}@post`, member: i.id, f: invariantF(i, POST) })),
      ...requirements.map((r) => ({ iid: r.id, member: r.id, f: requirementF(r) })),
    ];
    const tracked = insts.map((i) => ({ id: i.iid, f: i.f }));
    const first = await run(env, budget, [...hardBase, xf], tracked);
    if (first.status === "sat") return { status: "wanted" };
    // If the obligations conflict without the example, Q-STATE or Q-FEAS reports it; the example adds nothing.
    const alone = await run(env, budget, hardBase, tracked);
    if (alone.status === "unsat") return { status: "wanted" };
    const { sets, incomplete } = await unsatSets(env, budget, [...hardBase, xf], insts, [x.id], [xf]);
    return { status: "failed", sets, incomplete, context: assumptions.map((a) => a.id).sort() };
  });
}

/** Q-PRES(T, I): A and I(s) and T and not I(s') unsatisfiable. */
export function qPres(env: QueryEnv, t: QTransition, inv: QInvariant, assumptions: QAssumption[], invariants: QInvariant[]): Promise<QueryResult> {
  return guarded(async () => {
    const budget = new Budget(env.budgetMs);
    const hard = [...assumptions.map((a) => assumptionF(a)), ...invariants.map((i) => invariantF(i, PRE)), transitionF(t), neg(invariantF(inv, POST))];
    const r = await run(env, budget, hard, []);
    if (r.status === "unsat") return { status: "wanted" };
    const set: MinimalSet = { members: [t.id, inv.id].sort(), collisionTerms: collisionTerms([transitionF(t), invariantF(inv, POST)]) };
    if (r.model !== undefined) set.witness = r.model;
    return { status: "failed", sets: [set], incomplete: false, context: assumptions.map((a) => a.id).sort() };
  });
}

/** Q-MEET(T, R): A and I(s) and T and not R unsatisfiable. */
export function qMeet(env: QueryEnv, t: QTransition, req: QRequirement, assumptions: QAssumption[], invariants: QInvariant[]): Promise<QueryResult> {
  return guarded(async () => {
    const budget = new Budget(env.budgetMs);
    const hard = [...assumptions.map((a) => assumptionF(a)), ...invariants.map((i) => invariantF(i, PRE)), transitionF(t), neg(requirementF(req))];
    const r = await run(env, budget, hard, []);
    if (r.status === "unsat") return { status: "wanted" };
    const set: MinimalSet = { members: [t.id, req.id].sort(), collisionTerms: collisionTerms([transitionF(t), requirementF(req)]) };
    if (r.model !== undefined) set.witness = r.model;
    return { status: "failed", sets: [set], incomplete: false, context: assumptions.map((a) => a.id).sort() };
  });
}

export interface Unconstrained {
  branch: "then" | "otherwise";
  field: string;
}

/**
 * unconstrained-after: for each field f and each branch, is there a pair of
 * post-states that differ only in f and both satisfy the branch? (Joint evaluation, section 5.)
 */
export async function unconstrainedAfter(
  env: QueryEnv,
  t: QTransition,
  assumptions: QAssumption[],
  invariants: QInvariant[],
): Promise<{ status: "ok"; gaps: Unconstrained[] } | { status: "unknown"; reason: string }> {
  const ev = env.vocabulary.events.find((e) => e.name === t.event);
  const st = env.vocabulary.states.find((s) => s.name === ev?.on);
  if (ev === undefined || st === undefined) return { status: "ok", gaps: [] };
  const second: Frame = { now: "pre", post: "post2", result: "" };
  const branches: { name: "then" | "otherwise"; f: (fr: Frame) => F }[] = [
    { name: "then", f: (fr) => all([ex(t.when, fr), ex(t.then, fr)]) },
    { name: "otherwise", f: (fr) => (t.otherwise === undefined ? neg(ex(t.when, fr)) : all([neg(ex(t.when, fr)), ex(t.otherwise, fr)])) },
  ];
  const fields = Object.keys(st.fields).sort();
  const gaps: Unconstrained[] = [];
  try {
    for (const b of branches) {
      for (const f of fields) {
        const budget = new Budget(env.budgetMs);
        const hard: F[] = [
          ...assumptions.map((a) => assumptionF(a)),
          ...invariants.map((i) => invariantF(i, PRE)),
          b.f(PRE),
          b.f(second),
          { op: "differ", a: fieldVar(st.name, f, "post"), b: fieldVar(st.name, f, "post2") },
          ...fields.filter((g) => g !== f).map((g): F => ({ op: "same", a: fieldVar(st.name, g, "post"), b: fieldVar(st.name, g, "post2") })),
        ];
        const r = await run(env, budget, hard, []);
        if (r.status === "sat") gaps.push({ branch: b.name, field: f });
      }
    }
  } catch (err) {
    if (err instanceof Unknown) return { status: "unknown", reason: err.reason };
    return { status: "unknown", reason: `solver-error: ${(err as Error).message}` };
  }
  return { status: "ok", gaps };
}

/** Check one formula for satisfiability under a fresh budget (used by refinement checks in composition). */
export async function satisfiable(env: QueryEnv, hard: F[]): Promise<"sat" | "unsat" | { unknown: string }> {
  try {
    const r = await run(env, new Budget(env.budgetMs), hard, []);
    return r.status === "sat" ? "sat" : "unsat";
  } catch (err) {
    return { unknown: err instanceof Unknown ? err.reason : `solver-error: ${(err as Error).message}` };
  }
}

export type RefinementResult = { status: "strengthens" } | { status: "weakens" | "vacuous"; witness?: Record<string, string> } | { status: "unknown"; reason: string };

/**
 * Refinement of Q by P (main tab, section 4.4): A and P satisfiable, then A and P imply Q.
 * Used for a local obligation that replaces an inherited one (main tab, section 6.3, rule 4).
 */
export async function refines(
  env: QueryEnv,
  local: { kind: "invariant"; f: QInvariant } | { kind: "requirement"; f: QRequirement },
  inherited: { kind: "invariant"; f: QInvariant } | { kind: "requirement"; f: QRequirement },
  assumptions: QAssumption[],
): Promise<RefinementResult> {
  if (local.kind !== inherited.kind) return { status: "weakens" };
  const frame = local.kind === "invariant" ? STATE : PRE;
  const fOf = (x: typeof local): F => (x.kind === "invariant" ? invariantF(x.f, STATE) : requirementF(x.f));
  const hardA = assumptions.map((a) => assumptionF(a, frame));
  const sat = await satisfiable(env, [...hardA, fOf(local)]);
  if (typeof sat === "object") return { status: "unknown", reason: sat.unknown };
  if (sat === "unsat") return { status: "vacuous" };
  try {
    const r = await run(env, new Budget(env.budgetMs), [...hardA, fOf(local), neg(fOf(inherited))], []);
    if (r.status === "unsat") return { status: "strengthens" };
    return r.model !== undefined ? { status: "weakens", witness: r.model } : { status: "weakens" };
  } catch (err) {
    return { status: "unknown", reason: err instanceof Unknown ? err.reason : `solver-error: ${(err as Error).message}` };
  }
}
