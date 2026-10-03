// Exact evaluation of expressions on concrete values, with unbounded integers.
// No solver is involved: this is direct computation (Evidence tab, section 3).
import type { At, Expr } from "./model.ts";

export type Value = bigint | boolean | EnumVal;
export interface EnumVal {
  enum: string;
  member: string;
}

export interface Valuation {
  field(state: string, field: string, at: At): Value | undefined;
  arg(event: string, name: string): Value | undefined;
  result(event: string): Value | undefined;
}

export class EvalError extends Error {
  readonly missing: string[];
  constructor(message: string, missing: string[] = []) {
    super(message);
    this.missing = missing;
  }
}

export function isEnumVal(v: Value | undefined): v is EnumVal {
  return typeof v === "object" && v !== null;
}

export function valueEquals(a: Value, b: Value): boolean {
  if (isEnumVal(a) && isEnumVal(b)) return a.enum === b.enum && a.member === b.member;
  return a === b;
}

export function valueToString(v: Value): string {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "true" : "false";
  return v.member;
}

/** Evaluate an expression. Throws EvalError on a missing value or an ill-typed operand. */
export function evaluate(e: Expr, val: Valuation): Value {
  switch (e.k) {
    case "int":
      return BigInt(e.v);
    case "bool":
      return e.v;
    case "enum":
      return { enum: e.enum, member: e.member };
    case "field": {
      const v = val.field(e.state, e.field, e.at);
      if (v === undefined) throw new EvalError(`no value for ${e.state}.${e.field}@${e.at}`, [`${e.state}.${e.field}@${e.at}`]);
      return v;
    }
    case "arg": {
      const v = val.arg(e.event, e.name);
      if (v === undefined) throw new EvalError(`no value for ${e.event}.${e.name}`, [`${e.event}.${e.name}`]);
      return v;
    }
    case "result": {
      const v = val.result(e.event);
      if (v === undefined) throw new EvalError(`no value for ${e.event}.result`, [`${e.event}.result`]);
      return v;
    }
    case "add":
      return int(evaluate(e.l, val)) + int(evaluate(e.r, val));
    case "sub":
      return int(evaluate(e.l, val)) - int(evaluate(e.r, val));
    case "eq":
      return valueEquals(evaluate(e.l, val), evaluate(e.r, val));
    case "ne":
      return !valueEquals(evaluate(e.l, val), evaluate(e.r, val));
    case "lt":
      return int(evaluate(e.l, val)) < int(evaluate(e.r, val));
    case "le":
      return int(evaluate(e.l, val)) <= int(evaluate(e.r, val));
    case "gt":
      return int(evaluate(e.l, val)) > int(evaluate(e.r, val));
    case "ge":
      return int(evaluate(e.l, val)) >= int(evaluate(e.r, val));
    case "and": {
      // Evaluate every operand so a missing value is never hidden by short-circuiting.
      const vs = e.xs.map((x) => bool(evaluate(x, val)));
      return vs.every((x) => x);
    }
    case "or": {
      const vs = e.xs.map((x) => bool(evaluate(x, val)));
      return vs.some((x) => x);
    }
    case "not":
      return !bool(evaluate(e.x, val));
    case "implies": {
      const l = bool(evaluate(e.l, val));
      const r = bool(evaluate(e.r, val));
      return !l || r;
    }
  }
}

export function evaluateBool(e: Expr, val: Valuation): boolean {
  return bool(evaluate(e, val));
}

function int(v: Value): bigint {
  if (typeof v !== "bigint") throw new EvalError(`expected an integer, found ${String(valueToString(v))}`);
  return v;
}

function bool(v: Value): boolean {
  if (typeof v !== "boolean") throw new EvalError(`expected a boolean, found ${valueToString(v)}`);
  return v;
}

/** A valuation over plain maps keyed "State.field@at", "Event.args.name", "Event.result". */
export function mapValuation(values: ReadonlyMap<string, Value>): Valuation {
  return {
    field: (s, f, at) => values.get(`${s}.${f}@${at}`),
    arg: (e, n) => values.get(`${e}.args.${n}`),
    result: (e) => values.get(`${e}.result`),
  };
}
