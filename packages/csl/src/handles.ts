// Expression handles (Language reference, section 3).
// Handles are opaque: their type parameters exist only for the compiler, and
// every method returns a new handle wrapping a model expression.
import type { Expr } from "@csh/kernel";

export type Phase = "now" | "pre" | "post" | "arg" | "result";

declare const PHASE: unique symbol;
declare const UNIT: unique symbol;
declare const ENUM: unique symbol;
declare const KIND: unique symbol;

export interface Int<U extends string | undefined, P extends Phase> {
  readonly [KIND]?: "int";
  readonly [UNIT]?: [U];
  readonly [PHASE]?: P;
  plus<Q extends Phase>(x: Int<U, Q>): Int<U, P | Q>;
  minus<Q extends Phase>(x: Int<U, Q>): Int<U, P | Q>;
  eq<Q extends Phase>(x: Int<U, Q>): Bool<P | Q>;
  ne<Q extends Phase>(x: Int<U, Q>): Bool<P | Q>;
  lt<Q extends Phase>(x: Int<U, Q>): Bool<P | Q>;
  lte<Q extends Phase>(x: Int<U, Q>): Bool<P | Q>;
  gt<Q extends Phase>(x: Int<U, Q>): Bool<P | Q>;
  gte<Q extends Phase>(x: Int<U, Q>): Bool<P | Q>;
}

export interface Bool<P extends Phase> {
  readonly [KIND]?: "bool";
  readonly [PHASE]?: P;
  and<Q extends Phase>(x: Bool<Q>): Bool<P | Q>;
  or<Q extends Phase>(x: Bool<Q>): Bool<P | Q>;
  not(): Bool<P>;
  implies<Q extends Phase>(x: Bool<Q>): Bool<P | Q>;
  eq<Q extends Phase>(x: Bool<Q>): Bool<P | Q>;
}

export interface EnumValue<N extends string, P extends Phase> {
  readonly [KIND]?: "enum";
  readonly [ENUM]?: [N];
  readonly [PHASE]?: P;
  eq<Q extends Phase>(x: EnumValue<N, Q>): Bool<P | Q>;
  ne<Q extends Phase>(x: EnumValue<N, Q>): Bool<P | Q>;
}

export type AnyHandle = Int<any, any> | Bool<any> | EnumValue<any, any>;

export type PhaseOf<H> = H extends { readonly [PHASE]?: infer P } ? Exclude<P, undefined> : never;

const HANDLE = Symbol.for("csl.handle");

/** The one runtime class behind every handle. */
export class Handle {
  readonly expr: Expr;
  readonly [HANDLE] = true;
  constructor(expr: Expr) {
    this.expr = expr;
  }
  plus(x: unknown): Handle {
    return new Handle({ k: "add", l: this.expr, r: toExpr(x) });
  }
  minus(x: unknown): Handle {
    return new Handle({ k: "sub", l: this.expr, r: toExpr(x) });
  }
  eq(x: unknown): Handle {
    return new Handle({ k: "eq", l: this.expr, r: toExpr(x) });
  }
  ne(x: unknown): Handle {
    return new Handle({ k: "ne", l: this.expr, r: toExpr(x) });
  }
  lt(x: unknown): Handle {
    return new Handle({ k: "lt", l: this.expr, r: toExpr(x) });
  }
  lte(x: unknown): Handle {
    return new Handle({ k: "le", l: this.expr, r: toExpr(x) });
  }
  gt(x: unknown): Handle {
    return new Handle({ k: "gt", l: this.expr, r: toExpr(x) });
  }
  gte(x: unknown): Handle {
    return new Handle({ k: "ge", l: this.expr, r: toExpr(x) });
  }
  and(x: unknown): Handle {
    return new Handle({ k: "and", xs: [this.expr, toExpr(x)] });
  }
  or(x: unknown): Handle {
    return new Handle({ k: "or", xs: [this.expr, toExpr(x)] });
  }
  not(): Handle {
    return new Handle({ k: "not", x: this.expr });
  }
  implies(x: unknown): Handle {
    return new Handle({ k: "implies", l: this.expr, r: toExpr(x) });
  }
  toJSON(): Expr {
    return this.expr;
  }
}

export function isHandle(x: unknown): x is Handle {
  return typeof x === "object" && x !== null && (x as Record<symbol, unknown>)[HANDLE] === true;
}

/**
 * Convert a handle to its expression. Anything else is kept as a raw marker
 * so that the IR check reports it as rule S6 instead of the builder guessing.
 */
export function toExpr(x: unknown): Expr {
  if (isHandle(x)) return x.expr;
  return { $raw: x === null ? "null" : typeof x } as unknown as Expr;
}

export function wrap<H>(e: Expr): H {
  return new Handle(e) as unknown as H;
}

/** Function form: one and node with every operand. */
export function and<const T extends readonly Bool<any>[]>(...xs: T): Bool<PhaseOf<T[number]>> {
  return wrap({ k: "and", xs: xs.map(toExpr) });
}

export function or<const T extends readonly Bool<any>[]>(...xs: T): Bool<PhaseOf<T[number]>> {
  return wrap({ k: "or", xs: xs.map(toExpr) });
}

export function not<P extends Phase>(x: Bool<P>): Bool<P> {
  return wrap({ k: "not", x: toExpr(x) });
}

/** Boolean literal. */
export function truth(v: boolean): Bool<never> {
  return wrap({ k: "bool", v });
}
