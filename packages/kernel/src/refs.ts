// Term references inside expressions and fragments.
import type { At, Expr, Ref, Type, Vocabulary } from "./model.ts";

export interface FieldUse {
  state: string;
  field: string;
  at: At;
}

export interface ExprRefs {
  fields: FieldUse[];
  args: { event: string; name: string }[];
  results: string[];
  enums: string[];
  units: string[];
}

export function emptyRefs(): ExprRefs {
  return { fields: [], args: [], results: [], enums: [], units: [] };
}

export function collectRefs(e: Expr | undefined, into: ExprRefs = emptyRefs()): ExprRefs {
  if (e === undefined || typeof e !== "object" || e === null) return into;
  switch (e.k) {
    case "int":
      if (e.unit !== undefined) into.units.push(e.unit);
      break;
    case "bool":
      break;
    case "enum":
      into.enums.push(e.enum);
      break;
    case "field":
      into.fields.push({ state: e.state, field: e.field, at: e.at });
      break;
    case "arg":
      into.args.push({ event: e.event, name: e.name });
      break;
    case "result":
      into.results.push(e.event);
      break;
    case "add":
    case "sub":
    case "eq":
    case "ne":
    case "lt":
    case "le":
    case "gt":
    case "ge":
    case "implies":
      collectRefs(e.l, into);
      collectRefs(e.r, into);
      break;
    case "and":
    case "or":
      for (const x of e.xs) collectRefs(x, into);
      break;
    case "not":
      collectRefs(e.x, into);
      break;
  }
  return into;
}

/** Phase-free name of a term, as used for bindings and the gap view. */
export function termOfField(state: string, field: string): string {
  return `${state}.${field}`;
}
export function termOfArg(event: string, name: string): string {
  return `${event}.args.${name}`;
}
export function termOfResult(event: string): string {
  return `${event}.result`;
}

export function refOfTerm(term: string, vocab: Vocabulary): Ref | undefined {
  const parts = term.split(".");
  if (parts.length === 2 && parts[1] === "result") return { k: "result", event: parts[0]! };
  if (parts.length === 3 && parts[1] === "args") return { k: "arg", event: parts[0]!, name: parts[2]! };
  if (parts.length === 2 && vocab.states.some((s) => s.name === parts[0])) return { k: "field", state: parts[0]!, field: parts[1]! };
  return undefined;
}

/** Bindable terms (fields, args, results) an expression references, without phase. */
export function bindableTerms(refs: ExprRefs): string[] {
  const s = new Set<string>();
  for (const f of refs.fields) s.add(termOfField(f.state, f.field));
  for (const a of refs.args) s.add(termOfArg(a.event, a.name));
  for (const r of refs.results) s.add(termOfResult(r));
  return [...s].sort();
}

export function typeOfRef(r: Ref, vocab: Vocabulary): Type | undefined {
  if (r.k === "field") return vocab.states.find((s) => s.name === r.state)?.fields[r.field];
  if (r.k === "arg") return vocab.events.find((e) => e.name === r.event)?.args[r.name];
  return vocab.events.find((e) => e.name === r.event)?.returns;
}
