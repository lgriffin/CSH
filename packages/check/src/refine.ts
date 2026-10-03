// The refinement check for a local obligation that replaces an inherited one (main tab,
// sections 4.4 and 6.3, rule 4): the local obligation must be satisfiable under the intent's
// assumptions and must imply the inherited one. Emission calls it through this function.
import type { Module, Obligation } from "@csh/kernel";
import { type QRequirement, refines, type SolverPort } from "@csh/solver";

export interface Replacement {
  intent: string;
  name: string;
  pack: string;
  inherited: Obligation;
  local: Obligation;
}


function side(o: Obligation): Parameters<typeof refines>[1] | undefined {
  if (o.kind === "invariant") return { kind: "invariant", f: { id: o.name, state: o.state, body: o.body } };
  if (o.kind === "requirement") {
    const f: QRequirement = { id: o.name, event: o.event, shall: o.shall, ensures: o.ensures };
    if (o.while !== undefined) f.while = o.while;
    if (o.and !== undefined) f.and = o.and;
    return { kind: "requirement", f };
  }
  return undefined;
}

export function makeRefiner(solver: SolverPort, budgetMs = 5000): (r: Replacement, module: Module) => Promise<{ status: string; reason?: string }> {
  return async (r, module) => {
    const local = side(r.local);
    const inherited = side(r.inherited);
    if (local === undefined || inherited === undefined) return { status: "unknown", reason: "reserved obligations have no refinement check in version 1" };
    const intent = module.intents.find((i) => i.name === r.intent);
    const assumptions = (intent?.assumptions ?? []).map((a) => ({ id: a.name, body: a.body }));
    const res = await refines({ solver, vocabulary: module.vocabulary, budgetMs }, local, inherited, assumptions);
    return res.status === "unknown" ? { status: "unknown", reason: res.reason } : { status: res.status };
  };
}

