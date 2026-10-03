// Expression typing and phase rules (Semantic contract, sections 2.1 and 2.2).
import type { At, Expr, Type, Vocabulary } from "./model.ts";
import { sameType, typeToString } from "./model.ts";

/** Positions of the phase table, section 2.2. */
export type Position =
  | "invariant" // now
  | "assumption" // now, arg
  | "transition-when" // pre, arg
  | "requirement-while" // pre
  | "requirement-and" // pre, arg
  | "step"; // pre, post, arg, result: then, otherwise, shall, ensures, example then

const ALLOWED: Record<Position, { at: readonly At[]; arg: boolean; result: boolean }> = {
  invariant: { at: ["now"], arg: false, result: false },
  assumption: { at: ["now"], arg: true, result: false },
  "transition-when": { at: ["pre"], arg: true, result: false },
  "requirement-while": { at: ["pre"], arg: false, result: false },
  "requirement-and": { at: ["pre"], arg: true, result: false },
  step: { at: ["pre", "post"], arg: true, result: true },
};

export type TypeErrorCode =
  | "raw-value" // S6
  | "unknown-term" // S1
  | "unit-mismatch" // S2
  | "type-mismatch"
  | "phase" // S3
  | "foreign-term"
  | "bad-literal";

export interface ExprTypeError {
  code: TypeErrorCode;
  message: string;
}

export interface TypingContext {
  vocabulary: Vocabulary;
  position: Position;
  /** The event the expression is about, for event-scoped positions. */
  event?: string;
  /** The state an invariant is about. */
  state?: string;
}

export interface TypingResult {
  type?: Type;
  errors: ExprTypeError[];
}

const INT_RE = /^-?(0|[1-9][0-9]*)$/;

export function isExprShape(e: unknown): e is Expr {
  return typeof e === "object" && e !== null && !Array.isArray(e) && typeof (e as { k?: unknown }).k === "string";
}

/** Type an expression at a position. Errors accumulate; the type is absent when unknown. */
export function typeExpr(e: unknown, ctx: TypingContext): TypingResult {
  const errors: ExprTypeError[] = [];
  const t = go(e, ctx, errors);
  return t === undefined ? { errors } : { type: t, errors };
}

/** Type an expression that must be boolean. */
export function checkBool(e: unknown, ctx: TypingContext): ExprTypeError[] {
  const r = typeExpr(e, ctx);
  if (r.type !== undefined && r.type.kind !== "bool") {
    r.errors.push({ code: "type-mismatch", message: `expected bool, found ${typeToString(r.type)}` });
  }
  return r.errors;
}

function eventDecl(v: Vocabulary, name: string) {
  return v.events.find((x) => x.name === name);
}

function go(e: unknown, ctx: TypingContext, errs: ExprTypeError[]): Type | undefined {
  if (!isExprShape(e)) {
    errs.push({ code: "raw-value", message: `raw JavaScript value (${describeRaw(e)}) where an expression is required` });
    return undefined;
  }
  const v = ctx.vocabulary;
  const allowed = ALLOWED[ctx.position];
  switch (e.k) {
    case "int": {
      if (typeof e.v !== "string" || !INT_RE.test(e.v)) {
        errs.push({ code: "bad-literal", message: `integer literal must be a decimal string, got ${JSON.stringify(e.v)}` });
        return undefined;
      }
      if (e.unit !== undefined && !v.units.some((u) => u.id === e.unit)) {
        errs.push({ code: "unknown-term", message: `unknown unit ${e.unit}` });
        return undefined;
      }
      return e.unit === undefined ? { kind: "int" } : { kind: "int", unit: e.unit };
    }
    case "bool":
      if (typeof e.v !== "boolean") {
        errs.push({ code: "bad-literal", message: "boolean literal must be true or false" });
        return undefined;
      }
      return { kind: "bool" };
    case "enum": {
      const d = v.enums.find((x) => x.name === e.enum);
      if (d === undefined || !d.members.includes(e.member)) {
        errs.push({ code: "unknown-term", message: `unknown enumeration member ${e.enum}.${e.member}` });
        return undefined;
      }
      return { kind: "enum", enum: e.enum };
    }
    case "field": {
      const s = v.states.find((x) => x.name === e.state);
      const ft = s?.fields[e.field];
      if (s === undefined || ft === undefined) {
        errs.push({ code: "unknown-term", message: `unknown field ${e.state}.${e.field}` });
        return undefined;
      }
      if (!allowed.at.includes(e.at)) {
        errs.push({ code: "phase", message: `${e.at} reference ${e.state}.${e.field} not allowed in ${ctx.position}` });
      }
      if (ctx.state !== undefined && e.state !== ctx.state) {
        errs.push({ code: "foreign-term", message: `field ${e.state}.${e.field} is not of state ${ctx.state}` });
      }
      if (ctx.event !== undefined) {
        const ev = eventDecl(v, ctx.event);
        if (ev !== undefined && ev.on !== e.state) {
          errs.push({ code: "foreign-term", message: `field ${e.state}.${e.field} is not of event ${ctx.event}'s state ${ev.on}` });
        }
      }
      return ft;
    }
    case "arg": {
      const ev = eventDecl(v, e.event);
      const at = ev?.args[e.name];
      if (ev === undefined || at === undefined) {
        errs.push({ code: "unknown-term", message: `unknown argument ${e.event}.${e.name}` });
        return undefined;
      }
      if (!allowed.arg) errs.push({ code: "phase", message: `argument ${e.event}.${e.name} not allowed in ${ctx.position}` });
      if (ctx.event !== undefined && ctx.event !== e.event) {
        errs.push({ code: "foreign-term", message: `argument of ${e.event} used for event ${ctx.event}` });
      }
      return at;
    }
    case "result": {
      const ev = eventDecl(v, e.event);
      if (ev === undefined || ev.returns === undefined) {
        errs.push({ code: "unknown-term", message: `event ${e.event} has no result` });
        return undefined;
      }
      if (!allowed.result) errs.push({ code: "phase", message: `result of ${e.event} not allowed in ${ctx.position}` });
      if (ctx.event !== undefined && ctx.event !== e.event) {
        errs.push({ code: "foreign-term", message: `result of ${e.event} used for event ${ctx.event}` });
      }
      return ev.returns;
    }
    case "add":
    case "sub": {
      const l = go(e.l, ctx, errs);
      const r = go(e.r, ctx, errs);
      if (l === undefined || r === undefined) return undefined;
      if (l.kind !== "int" || r.kind !== "int") {
        errs.push({ code: "type-mismatch", message: `${e.k} needs int operands, found ${typeToString(l)} and ${typeToString(r)}` });
        return undefined;
      }
      if ((l.unit ?? null) !== (r.unit ?? null)) {
        errs.push({ code: "unit-mismatch", message: `${e.k} of ${typeToString(l)} and ${typeToString(r)}` });
        return undefined;
      }
      return l;
    }
    case "lt":
    case "le":
    case "gt":
    case "ge": {
      const l = go(e.l, ctx, errs);
      const r = go(e.r, ctx, errs);
      if (l === undefined || r === undefined) return { kind: "bool" };
      if (l.kind !== "int" || r.kind !== "int") {
        errs.push({ code: "type-mismatch", message: `${e.k} needs int operands, found ${typeToString(l)} and ${typeToString(r)}` });
      } else if ((l.unit ?? null) !== (r.unit ?? null)) {
        errs.push({ code: "unit-mismatch", message: `${e.k} of ${typeToString(l)} and ${typeToString(r)}` });
      }
      return { kind: "bool" };
    }
    case "eq":
    case "ne": {
      const l = go(e.l, ctx, errs);
      const r = go(e.r, ctx, errs);
      if (l === undefined || r === undefined) return { kind: "bool" };
      if (!sameType(l, r)) {
        const code = l.kind === "int" && r.kind === "int" ? "unit-mismatch" : "type-mismatch";
        errs.push({ code, message: `${e.k} of ${typeToString(l)} and ${typeToString(r)}` });
      }
      return { kind: "bool" };
    }
    case "and":
    case "or": {
      if (!Array.isArray(e.xs) || e.xs.length === 0) {
        errs.push({ code: "bad-literal", message: `${e.k} needs at least one operand` });
        return { kind: "bool" };
      }
      for (const x of e.xs) boolOperand(x, ctx, errs, e.k);
      return { kind: "bool" };
    }
    case "not":
      boolOperand(e.x, ctx, errs, "not");
      return { kind: "bool" };
    case "implies":
      boolOperand(e.l, ctx, errs, "implies");
      boolOperand(e.r, ctx, errs, "implies");
      return { kind: "bool" };
    default:
      errs.push({ code: "raw-value", message: `unknown expression form ${JSON.stringify((e as { k: unknown }).k)}` });
      return undefined;
  }
}

function boolOperand(x: unknown, ctx: TypingContext, errs: ExprTypeError[], op: string): void {
  const t = go(x, ctx, errs);
  if (t !== undefined && t.kind !== "bool") {
    errs.push({ code: "type-mismatch", message: `${op} needs bool operands, found ${typeToString(t)}` });
  }
}

function describeRaw(e: unknown): string {
  if (e === null) return "null";
  if (typeof e === "object" && e !== null && "$raw" in e) return String((e as { $raw: unknown }).$raw);
  return typeof e;
}
