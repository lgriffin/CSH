// A solver-independent formula language over model expressions, with frames
// that say at which state each reference is read (Joint evaluation, section 3).
import type { Expr, Type, Vocabulary } from "@csh/kernel";

/** Which instance each phase reads. */
export interface Frame {
  /** Where a `now` reference is read: the pre-state, the post-state, or a lone state (Q-STATE). */
  now: string;
  /** The post-state instance: "post", or "post2" for the second copy in unconstrained-after. */
  post: string;
  /** Suffix of the result constant: "" or "@2". */
  result: string;
}

export const PRE: Frame = { now: "pre", post: "post", result: "" };
export const POST: Frame = { now: "post", post: "post", result: "" };
export const STATE: Frame = { now: "now", post: "post", result: "" };

export type F =
  | { op: "expr"; e: Expr; frame: Frame }
  | { op: "and" | "or"; xs: F[] }
  | { op: "not"; x: F }
  | { op: "implies"; l: F; r: F }
  | { op: "const"; v: boolean }
  | { op: "forall"; vars: string[]; body: F }
  | { op: "same" | "differ"; a: string; b: string };

export const T: F = { op: "const", v: true };
export const FALSE: F = { op: "const", v: false };
export const ex = (e: Expr, frame: Frame = PRE): F => ({ op: "expr", e, frame });
export const all = (xs: F[]): F => (xs.length === 0 ? T : xs.length === 1 ? xs[0]! : { op: "and", xs });
export const any = (xs: F[]): F => (xs.length === 0 ? FALSE : xs.length === 1 ? xs[0]! : { op: "or", xs });
export const neg = (x: F): F => ({ op: "not", x });
export const imp = (l: F, r: F): F => ({ op: "implies", l, r });

export function fieldVar(state: string, field: string, instance: string): string {
  return `${state}.${field}@${instance}`;
}
export function argVar(event: string, name: string): string {
  return `${event}.args.${name}`;
}
export function resultVar(event: string, suffix = ""): string {
  return `${event}.result${suffix}`;
}

/** Name of the constant a reference denotes in a frame. */
export function varOf(e: Expr & { k: "field" | "arg" | "result" }, frame: Frame): string {
  if (e.k === "field") return fieldVar(e.state, e.field, e.at === "now" ? frame.now : e.at === "pre" ? "pre" : frame.post);
  if (e.k === "arg") return argVar(e.event, e.name);
  return resultVar(e.event, frame.result);
}

/** The model type of a constant, from its name. */
export function typeOfVar(name: string, v: Vocabulary): Type | undefined {
  const m = /^([A-Za-z0-9]+)\.(.+)$/.exec(name);
  if (m === null) return undefined;
  const [, head, rest] = m;
  if (rest!.startsWith("args.")) return v.events.find((e) => e.name === head)?.args[rest!.slice(5)];
  if (rest === "result" || rest!.startsWith("result@")) return v.events.find((e) => e.name === head)?.returns;
  const at = rest!.indexOf("@");
  const field = at < 0 ? rest! : rest!.slice(0, at);
  return v.states.find((s) => s.name === head)?.fields[field];
}

/** Every constant a formula mentions, free or bound. */
export function varsOf(f: F, out: Set<string> = new Set()): Set<string> {
  switch (f.op) {
    case "expr":
      exprVars(f.e, f.frame, out);
      break;
    case "and":
    case "or":
      f.xs.forEach((x) => varsOf(x, out));
      break;
    case "not":
      varsOf(f.x, out);
      break;
    case "implies":
      varsOf(f.l, out);
      varsOf(f.r, out);
      break;
    case "forall":
      f.vars.forEach((v) => out.add(v));
      varsOf(f.body, out);
      break;
    case "same":
    case "differ":
      out.add(f.a);
      out.add(f.b);
      break;
    case "const":
      break;
  }
  return out;
}

function exprVars(e: Expr, frame: Frame, out: Set<string>): void {
  switch (e.k) {
    case "field":
    case "arg":
    case "result":
      out.add(varOf(e, frame));
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
      exprVars(e.l, frame, out);
      exprVars(e.r, frame, out);
      break;
    case "and":
    case "or":
      e.xs.forEach((x) => exprVars(x, frame, out));
      break;
    case "not":
      exprVars(e.x, frame, out);
      break;
    default:
      break;
  }
}

/** Free constants: those not bound by an enclosing forall. */
export function freeVarsOf(f: F, bound: Set<string> = new Set(), out: Set<string> = new Set()): Set<string> {
  switch (f.op) {
    case "forall": {
      const b = new Set([...bound, ...f.vars]);
      freeVarsOf(f.body, b, out);
      break;
    }
    case "and":
    case "or":
      f.xs.forEach((x) => freeVarsOf(x, bound, out));
      break;
    case "not":
      freeVarsOf(f.x, bound, out);
      break;
    case "implies":
      freeVarsOf(f.l, bound, out);
      freeVarsOf(f.r, bound, out);
      break;
    default:
      for (const v of varsOf(f)) if (!bound.has(v)) out.add(v);
  }
  return out;
}
