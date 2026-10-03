// Steps 1 and 2 of joint evaluation (Joint evaluation, section 1): add adapter output to
// the model, type-check lifted claims, and build the pool.
import {
  canonicalJson,
  type ClaimSet,
  fragmentsOf,
  type Fragment,
  type Module,
  type Obligation,
  validateAssumption,
  validateExample,
  validateObligation,
  ViolationCollector,
} from "@csh/kernel";
import type { SourceItem, Witness } from "@csh/witness";
import type { SourceRun } from "./sources.ts";

export interface SourcedWitness {
  source: string;
  witness: Witness;
  span?: string;
}

export interface Prepared {
  /** The emitted model with every comparable lifted claim added. */
  module: Module;
  fragments: Fragment[];
  notComparable: { fragment: string; source: string; reason: string; detail?: string }[];
  unliftable: { source: string; span: string; reason: string; text: string }[];
  witnesses: SourcedWitness[];
  items: (SourceItem & { source: string })[];
  diagnostics: { source: string; code: string; severity: string; message: string; span?: string }[];
  runs: SourceRun[];
}

const NOT_COMPARABLE = new Set(["unit-mismatch", "type-mismatch"]);

type Claim = { kind: "assumption"; node: ClaimSet["assumptions"][number] } | { kind: "obligation"; node: Obligation } | { kind: "example"; node: ClaimSet["examples"][number] };

/** Check one lifted claim on its own. Returns undefined when it is comparable. */
function typeCheckClaim(m: Module, c: Claim): { code: string; message: string } | undefined {
  const col = new ViolationCollector();
  if (c.kind === "assumption") validateAssumption(col, m.vocabulary, c.node, c.node.name);
  else if (c.kind === "obligation") validateObligation(col, m.vocabulary, c.node, c.node.name);
  else validateExample(col, m.vocabulary, c.node, c.node.name);
  // A mismatch of unit or type decides comparability before anything else (Joint evaluation, section 2).
  const v = col.out.find((x) => x.code !== undefined && NOT_COMPARABLE.has(x.code)) ?? col.out[0];
  if (v === undefined) return undefined;
  // A literal in a unit this vocabulary does not declare comes from another vocabulary: the term is known, the unit differs.
  if (v.code === "unknown-term" && v.message.startsWith("unknown unit")) return { code: "unit-mismatch", message: v.message };
  return { code: v.code ?? v.rule, message: v.message };
}

export function prepare(emitted: Module, runs: SourceRun[]): Prepared {
  const module: Module = structuredClone(emitted);
  const out: Prepared = { module, fragments: [], notComparable: [], unliftable: [], witnesses: [], items: [], diagnostics: [], runs };
  // Add adapter claims to the claim set of their source.
  for (const r of runs) {
    for (const d of r.output.diagnostics) {
      const e: Prepared["diagnostics"][number] = { source: r.source, code: d.code, severity: d.severity, message: d.message };
      if (d.span !== undefined) e.span = d.span;
      out.diagnostics.push(e);
    }
    for (const w of r.output.witnesses ?? []) {
      const sw: SourcedWitness = { source: r.source, witness: w };
      const span = r.output.witnessSpans?.[w.id];
      if (span !== undefined) sw.span = span;
      out.witnesses.push(sw);
    }
    for (const it of r.output.items ?? []) out.items.push({ ...it, source: r.source });
    const lifted = r.output.claims;
    if (lifted === undefined) continue;
    let set = module.claims.find((c) => c.source === r.source);
    if (set === undefined) {
      set = { source: r.source, assumptions: [], obligations: [], examples: [], unliftable: [] };
      module.claims.push(set);
    }
    set.assumptions.push(...lifted.assumptions);
    set.obligations.push(...lifted.obligations);
    set.examples.push(...lifted.examples);
    set.unliftable.push(...lifted.unliftable);
  }
  // Type-check every claim; move the ones that fail out of the pool.
  for (const set of module.claims) {
    const qn = (name: string) => `${module.system}/@${set.source}/${name}`;
    const at = module.sources.find((s) => s.name === set.source)?.at ?? set.source;
    const keep = <T extends { name: string }>(kind: Claim["kind"], xs: T[]): T[] =>
      xs.filter((node) => {
        const problem = typeCheckClaim(module, { kind, node } as unknown as Claim);
        if (problem === undefined) return true;
        if (NOT_COMPARABLE.has(problem.code)) {
          out.notComparable.push({ fragment: qn(node.name), source: set.source, reason: problem.code, detail: problem.message });
        } else {
          const reason = problem.code === "foreign-term" || problem.code === "S1" ? "unknown-term" : problem.code;
          set.unliftable.push({ span: at, reason, text: canonicalJson(node) });
        }
        return false;
      });
    set.assumptions = keep("assumption", set.assumptions);
    set.obligations = keep("obligation", set.obligations);
    set.examples = keep("example", set.examples);
    for (const u of set.unliftable) out.unliftable.push({ source: set.source, span: u.span, reason: u.reason, text: u.text });
  }
  out.fragments = fragmentsOf(module);
  return out;
}
