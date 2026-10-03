// Fragments, qualified names and fragment digests (Semantic contract, section 5; Language reference, section 6).
import { canonicalJson, canonicalModule, compareCodePoints, digestJson, digestOf, refName } from "./canonical.ts";
import type {
  Assumption,
  Binding,
  Cite,
  Digest,
  Example,
  Module,
  Obligation,
  Policy,
  Ref,
  Transition,
  Type,
  Vocabulary,
} from "./model.ts";
import { collectRefs, emptyRefs, type ExprRefs } from "./refs.ts";

export type FragmentKind =
  | "assumption"
  | "invariant"
  | "requirement"
  | "architecture"
  | "temporal"
  | "example"
  | "transition"
  | "binding";

/** The pseudo-source holding the module's own transitions and bindings (ASSUMPTIONS.md, A-04). */
export const MODEL_SOURCE = "model";
/** Intent blocks count as one source named intent (Joint evaluation, section 5). */
export const INTENT_SOURCE = "intent";

export type FragmentNode = Assumption | Obligation | Example | Transition | Binding;

export interface Fragment {
  /** Qualified name: System/Intent/Name, System/@Source/Name, System/#transition/Event, System/#binding/Term. */
  name: string;
  local: string;
  kind: FragmentKind;
  /** Source column: "intent", a source name, or "model". */
  source: string;
  /** Intent name, "@Source", "#transition" or "#binding". */
  container: string;
  node: FragmentNode;
  digest: Digest;
  /** Assurance policy for intent obligations. */
  policy?: Policy;
  cites: Cite[];
  /** True when the fragment came from a ClaimSet (lifted or hand-written claims). */
  lifted: boolean;
}

/** Declaration keys a node references, and their canonical content. */
export function declarationsOf(node: FragmentNode, kind: FragmentKind, vocab: Vocabulary): Map<string, unknown> {
  const refs: ExprRefs = emptyRefs();
  const events = new Set<string>();
  const states = new Set<string>();
  const direct: Ref[] = [];
  switch (kind) {
    case "assumption":
      collectRefs((node as Assumption).body, refs);
      break;
    case "invariant": {
      const n = node as Obligation & { kind: "invariant" };
      states.add(n.state);
      collectRefs(n.body, refs);
      break;
    }
    case "requirement": {
      const n = node as Obligation & { kind: "requirement" };
      events.add(n.event);
      collectRefs(n.while, refs);
      collectRefs(n.and, refs);
      collectRefs(n.shall, refs);
      for (const x of n.ensures) collectRefs(x, refs);
      break;
    }
    case "architecture":
    case "temporal":
      break;
    case "example": {
      const n = node as Example;
      events.add(n.event);
      const ev = vocab.events.find((e) => e.name === n.event);
      for (const [f, x] of Object.entries(n.given)) {
        if (ev !== undefined) refs.fields.push({ state: ev.on, field: f, at: "pre" });
        collectRefs(x, refs);
      }
      for (const [a, x] of Object.entries(n.args)) {
        refs.args.push({ event: n.event, name: a });
        collectRefs(x, refs);
      }
      collectRefs(n.then, refs);
      break;
    }
    case "transition": {
      const n = node as Transition;
      events.add(n.event);
      collectRefs(n.when, refs);
      collectRefs(n.then, refs);
      collectRefs(n.otherwise, refs);
      break;
    }
    case "binding":
      direct.push((node as Binding).target);
      break;
  }
  for (const r of direct) {
    if (r.k === "field") refs.fields.push({ state: r.state, field: r.field, at: "now" });
    else if (r.k === "arg") refs.args.push({ event: r.event, name: r.name });
    else refs.results.push(r.event);
  }
  const out = new Map<string, unknown>();
  const addType = (t: Type | undefined) => {
    if (t === undefined) return;
    if (t.kind === "int" && t.unit !== undefined) addUnit(t.unit);
    if (t.kind === "enum") addEnum(t.enum);
  };
  const addUnit = (id: string) => {
    out.set(`unit:${id}`, vocab.units.find((u) => u.id === id) ?? { missing: id });
  };
  const addEnum = (name: string) => {
    out.set(`enum:${name}`, vocab.enums.find((e) => e.name === name) ?? { missing: name });
  };
  for (const u of refs.units) addUnit(u);
  for (const e of refs.enums) addEnum(e);
  for (const s of states) out.set(`state:${s}`, { name: s, exists: vocab.states.some((x) => x.name === s) });
  for (const e of events) {
    const d = vocab.events.find((x) => x.name === e);
    out.set(`event:${e}`, d === undefined ? { missing: e } : { name: d.name, on: d.on });
  }
  for (const f of refs.fields) {
    const t = vocab.states.find((s) => s.name === f.state)?.fields[f.field];
    out.set(`field:${f.state}.${f.field}`, { state: f.state, field: f.field, type: t ?? null });
    addType(t);
  }
  for (const a of refs.args) {
    const ev = vocab.events.find((e) => e.name === a.event);
    const t = ev?.args[a.name];
    out.set(`arg:${a.event}.${a.name}`, { event: a.event, on: ev?.on ?? null, name: a.name, type: t ?? null });
    addType(t);
  }
  for (const r of refs.results) {
    const ev = vocab.events.find((e) => e.name === r);
    out.set(`result:${r}`, { event: r, on: ev?.on ?? null, returns: ev?.returns ?? null });
    addType(ev?.returns);
  }
  return out;
}

/** SHA-256 over the fragment's canonical JSON followed by the sorted digests of every declaration it references. */
export function fragmentDigest(node: FragmentNode, kind: FragmentKind, vocab: Vocabulary): Digest {
  const decls = declarationsOf(node, kind, vocab);
  const ds = [...decls.values()].map((d) => digestJson(d)).sort(compareCodePoints);
  return digestOf(canonicalJson(node) + ds.join(""));
}

function obligationKind(o: Obligation): FragmentKind {
  return o.kind;
}

/** Enumerate every fragment of a module in canonical order. */
export function fragmentsOf(module: Module): Fragment[] {
  const m = canonicalModule(module);
  const sys = m.system;
  const v = m.vocabulary;
  const out: Fragment[] = [];
  const push = (
    container: string,
    source: string,
    local: string,
    kind: FragmentKind,
    node: FragmentNode,
    lifted: boolean,
    policy?: Policy,
  ) => {
    const f: Fragment = {
      name: `${sys}/${container}/${local}`,
      local,
      kind,
      source,
      container,
      node,
      digest: fragmentDigest(node, kind, v),
      cites: (node as { cites?: Cite[] }).cites ?? [],
      lifted,
    };
    if (policy !== undefined) f.policy = policy;
    out.push(f);
  };
  for (const i of m.intents) {
    const policy = m.policies.find((p) => p.name === i.assurance);
    for (const a of i.assumptions) push(i.name, INTENT_SOURCE, a.name, "assumption", a, false);
    for (const o of i.obligations) push(i.name, INTENT_SOURCE, o.name, obligationKind(o), o, false, policy);
    for (const e of i.examples) push(i.name, INTENT_SOURCE, e.name, "example", e, false);
  }
  for (const c of m.claims) {
    const container = `@${c.source}`;
    for (const a of c.assumptions) push(container, c.source, a.name, "assumption", a, true);
    for (const o of c.obligations) push(container, c.source, o.name, obligationKind(o), o, true);
    for (const e of c.examples) push(container, c.source, e.name, "example", e, true);
  }
  const perEvent = new Map<string, number>();
  for (const t of m.transitions) perEvent.set(t.event, (perEvent.get(t.event) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const t of m.transitions) {
    const n = (seen.get(t.event) ?? 0) + 1;
    seen.set(t.event, n);
    const local = (perEvent.get(t.event) ?? 0) > 1 ? `${t.event}#${n}` : t.event;
    push("#transition", MODEL_SOURCE, local, "transition", t, false);
  }
  for (const b of m.bindings) push("#binding", MODEL_SOURCE, refName(b.target), "binding", b, false);
  return out;
}
