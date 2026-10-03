// Independent checks of what the solver returned: a counterexample must really be one,
// and an input reported to have no valid outcome must really have none. The first uses
// exact evaluation with no solver; the second asks the solver a fresh, unminimised query.
import { type Assumption, evaluateBool, type Expr, type Fragment, type Invariant, mapValuation, type Module, type Requirement, type Transition, type Value } from "@csh/kernel";
import type { Finding } from "@csh/check";
import { all, ex, invariantF, POST, PRE, requirementF, satisfiable, type SolverPort, typeOfVar } from "@csh/solver";

function valuesOf(witness: Record<string, string>, m: Module): Map<string, Value> {
  const vals = new Map<string, Value>();
  for (const [k, v] of Object.entries(witness)) {
    const t = typeOfVar(k, m.vocabulary);
    if (t === undefined) continue;
    vals.set(k, t.kind === "int" ? BigInt(v) : t.kind === "bool" ? v === "true" : { enum: t.enum, member: v });
  }
  return vals;
}

/** Read `now` references at one phase. */
function atPhase(vals: Map<string, Value>, phase: "pre" | "post"): Map<string, Value> {
  const out = new Map(vals);
  for (const [k, v] of vals) if (k.endsWith(`@${phase}`)) out.set(k.replace(/@(pre|post)$/, "@now"), v);
  return out;
}

const holds = (e: Expr, vals: Map<string, Value>) => evaluateBool(e, mapValuation(vals));

function transitionHolds(t: Transition, vals: Map<string, Value>): boolean {
  const w = holds(t.when, vals);
  if (w) return holds(t.then, vals);
  return t.otherwise === undefined ? true : holds(t.otherwise, vals);
}

function requirementHolds(r: Requirement, vals: Map<string, Value>): boolean {
  const trig = (r.while === undefined || holds(r.while, vals)) && (r.and === undefined || holds(r.and, vals));
  return !trig || [r.shall, ...r.ensures].every((e) => holds(e, vals));
}

/** A not-preserved or not-met counterexample: context and invariants hold before, the transition holds, the obligation fails. */
export function verifyCounterexample(f: Finding, m: Module, fragments: Fragment[]): string | undefined {
  if (f.witness === undefined) return "no counterexample";
  const vals = valuesOf(f.witness, m);
  const byName = new Map(fragments.map((x) => [x.name, x]));
  const t = f.members.map((x) => byName.get(x.fragment)).find((x) => x?.kind === "transition");
  const o = f.members.map((x) => byName.get(x.fragment)).find((x) => x?.kind === "invariant" || x?.kind === "requirement");
  if (t === undefined || o === undefined) return "members are not a transition and an obligation";
  try {
    for (const c of f.context) {
      const a = byName.get(c);
      if (a !== undefined && !holds((a.node as Assumption).body, atPhase(vals, "pre"))) return `assumption ${c} is false in the counterexample`;
    }
    if (!transitionHolds(t.node as Transition, vals)) return "the transition does not hold in the counterexample";
    if (o.kind === "invariant") {
      const inv = o.node as Invariant;
      if (!holds(inv.body, atPhase(vals, "pre"))) return "the invariant is already false before the step";
      if (holds(inv.body, atPhase(vals, "post"))) return "the invariant holds after the step";
    } else if (requirementHolds(o.node as Requirement, vals)) return "the requirement holds in the counterexample";
  } catch (err) {
    return `could not evaluate the counterexample: ${(err as Error).message}`;
  }
  return undefined;
}

/** A joint-conflict input: no post-state and result satisfy the members together. */
export async function verifyNoOutcome(f: Finding, m: Module, fragments: Fragment[], solver: SolverPort): Promise<string | undefined> {
  if (f.witness === undefined) return "no input given";
  const byName = new Map(fragments.map((x) => [x.name, x]));
  const fixed = Object.entries(f.witness)
    .filter(([k]) => k.endsWith("@pre") || k.includes(".args."))
    .map(([k, v]) => {
      const t = typeOfVar(k, m.vocabulary)!;
      const at = k.match(/^([A-Za-z0-9]+)\.([A-Za-z0-9]+)@pre$/);
      const lhs: Expr = at !== null ? { k: "field", state: at[1]!, field: at[2]!, at: "pre" } : { k: "arg", event: k.split(".")[0]!, name: k.split(".")[2]! };
      const rhs: Expr = t.kind === "int" ? { k: "int", v, ...(t.unit !== undefined ? { unit: t.unit } : {}) } : t.kind === "bool" ? { k: "bool", v: v === "true" } : { k: "enum", enum: t.enum, member: v };
      return ex({ k: "eq", l: lhs, r: rhs }, PRE);
    });
  const body = f.members.map((x) => byName.get(x.fragment)!).map((x) =>
    x.kind === "requirement" ? requirementF({ id: x.name, ...(x.node as Requirement) }) : invariantF({ id: x.name, state: (x.node as Invariant).state, body: (x.node as Invariant).body }, POST),
  );
  const r = await satisfiable({ solver, vocabulary: m.vocabulary, budgetMs: 10000 }, [...fixed, all(body)]);
  if (r === "unsat") return undefined;
  return r === "sat" ? "an outcome exists for the reported input" : `solver could not decide: ${r.unknown}`;
}
