// The Z3 adapter for the solver port: linear integer arithmetic, enumerations as
// bounded integers, tracked assertions for unsatisfiable cores (Joint evaluation, section 3).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Expr, Type, Vocabulary } from "@csh/kernel";
import { type F, type Frame, freeVarsOf, typeOfVar, varOf } from "./formula.ts";
import type { CheckInput, CheckResult, SolverPort } from "./port.ts";

let initPromise: Promise<any> | undefined;

async function z3(): Promise<any> {
  if (initPromise === undefined) {
    initPromise = (async () => {
      const mod: any = await import("z3-solver");
      const api = await mod.init();
      return api;
    })();
  }
  return initPromise;
}

export async function createZ3Solver(): Promise<SolverPort> {
  const api = await z3();
  const version: string = typeof api.Z3.get_full_version === "function" ? String(api.Z3.get_full_version()) : "unknown";
  const ctx = new api.Context("csh");
  let chain: Promise<unknown> = Promise.resolve();
  return {
    id: `z3 ${version.replace(/^Z3\s+/, "")}`,
    check(input: CheckInput): Promise<CheckResult> {
      const run = chain.then(() => checkWith(ctx, input));
      chain = run.catch(() => undefined);
      return run;
    },
  };
}

class Encoder {
  readonly consts = new Map<string, any>();
  readonly enumRanges = new Map<string, number>();
  private readonly ctx: any;
  private readonly vocab: Vocabulary;
  constructor(ctx: any, vocab: Vocabulary) {
    this.ctx = ctx;
    this.vocab = vocab;
  }

  typeOf(name: string): Type {
    const t = typeOfVar(name, this.vocab);
    if (t === undefined) throw new Error(`no type for constant ${name}`);
    return t;
  }

  constOf(name: string): any {
    let c = this.consts.get(name);
    if (c !== undefined) return c;
    const t = this.typeOf(name);
    if (t.kind === "bool") c = this.ctx.Bool.const(name);
    else c = this.ctx.Int.const(name);
    if (t.kind === "enum") {
      const n = this.vocab.enums.find((e) => e.name === t.enum)?.members.length ?? 0;
      this.enumRanges.set(name, n);
    }
    this.consts.set(name, c);
    return c;
  }

  range(name: string): any | undefined {
    const n = this.enumRanges.get(name);
    if (n === undefined) return undefined;
    const c = this.constOf(name);
    return this.ctx.And(c.ge(0), c.lt(n));
  }

  expr(e: Expr, frame: Frame): any {
    const ctx = this.ctx;
    switch (e.k) {
      case "int":
        return ctx.Int.val(BigInt(e.v));
      case "bool":
        return ctx.Bool.val(e.v);
      case "enum": {
        const idx = this.vocab.enums.find((x) => x.name === e.enum)?.members.indexOf(e.member) ?? -1;
        if (idx < 0) throw new Error(`unknown member ${e.enum}.${e.member}`);
        return ctx.Int.val(idx);
      }
      case "field":
      case "arg":
      case "result":
        return this.constOf(varOf(e, frame));
      case "add":
        return this.expr(e.l, frame).add(this.expr(e.r, frame));
      case "sub":
        return this.expr(e.l, frame).sub(this.expr(e.r, frame));
      case "eq":
        return this.expr(e.l, frame).eq(this.expr(e.r, frame));
      case "ne":
        return this.expr(e.l, frame).neq(this.expr(e.r, frame));
      case "lt":
        return this.expr(e.l, frame).lt(this.expr(e.r, frame));
      case "le":
        return this.expr(e.l, frame).le(this.expr(e.r, frame));
      case "gt":
        return this.expr(e.l, frame).gt(this.expr(e.r, frame));
      case "ge":
        return this.expr(e.l, frame).ge(this.expr(e.r, frame));
      case "and":
        return ctx.And(...e.xs.map((x) => this.expr(x, frame)));
      case "or":
        return ctx.Or(...e.xs.map((x) => this.expr(x, frame)));
      case "not":
        return ctx.Not(this.expr(e.x, frame));
      case "implies":
        return ctx.Implies(this.expr(e.l, frame), this.expr(e.r, frame));
    }
  }

  formula(f: F): any {
    const ctx = this.ctx;
    switch (f.op) {
      case "expr":
        return this.expr(f.e, f.frame);
      case "and":
        return f.xs.length === 0 ? ctx.Bool.val(true) : ctx.And(...f.xs.map((x) => this.formula(x)));
      case "or":
        return f.xs.length === 0 ? ctx.Bool.val(false) : ctx.Or(...f.xs.map((x) => this.formula(x)));
      case "not":
        return ctx.Not(this.formula(f.x));
      case "implies":
        return ctx.Implies(this.formula(f.l), this.formula(f.r));
      case "const":
        return ctx.Bool.val(f.v);
      case "same":
        return this.constOf(f.a).eq(this.constOf(f.b));
      case "differ":
        return this.constOf(f.a).neq(this.constOf(f.b));
      case "forall": {
        const vars = f.vars.map((v) => this.constOf(v));
        const ranges = f.vars.map((v) => this.range(v)).filter((x) => x !== undefined);
        const body = this.formula(f.body);
        const guarded = ranges.length === 0 ? body : ctx.Implies(ctx.And(...ranges), body);
        return vars.length === 0 ? guarded : ctx.ForAll(vars, guarded);
      }
    }
  }
}

function valueString(v: any, t: Type, vocab: Vocabulary): string {
  const s = String(v.toString());
  if (t.kind === "bool") return s === "true" ? "true" : "false";
  // Z3 prints negative integers as "(- 5)".
  const norm = s.replace(/^\(-\s*(\d+)\)$/, "-$1");
  if (t.kind === "enum") {
    const members = vocab.enums.find((e) => e.name === t.enum)?.members ?? [];
    return members[Number(norm)] ?? norm;
  }
  return norm;
}

async function checkWith(ctx: any, input: CheckInput): Promise<CheckResult> {
  if (!(input.timeoutMs > 0)) return { status: "unknown", reason: "solver-timeout" };
  try {
    const enc = new Encoder(ctx, input.vocabulary);
    const solver = new ctx.Solver();
    solver.set("timeout", Math.max(1, Math.floor(input.timeoutMs)));
    const all: F[] = [...input.hard, ...input.tracked.map((t) => t.f)];
    for (const h of input.hard) solver.add(enc.formula(h));
    const lits: any[] = [];
    const litToId = new Map<string, string>();
    input.tracked.forEach((t, i) => {
      const lit = ctx.Bool.const(`__track_${i}`);
      litToId.set(`__track_${i}`, t.id);
      solver.add(ctx.Implies(lit, enc.formula(t.f)));
      lits.push(lit);
    });
    const free = new Set<string>();
    for (const f of all) freeVarsOf(f, new Set(), free);
    for (const v of free) {
      enc.constOf(v);
      const r = enc.range(v);
      if (r !== undefined) solver.add(r);
    }
    const status: string = await solver.check(...lits);
    if (status === "unsat") {
      const core = solver.unsatCore();
      const ids: string[] = [];
      for (let i = 0; i < core.length(); i++) {
        const id = litToId.get(String(core.get(i).toString()));
        if (id !== undefined) ids.push(id);
      }
      return { status: "unsat", core: [...new Set(ids)].sort() };
    }
    if (status === "sat") {
      const model = solver.model();
      const out: Record<string, string> = {};
      for (const v of [...free].sort()) {
        const val = model.eval(enc.constOf(v), true);
        out[v] = valueString(val, enc.typeOf(v), input.vocabulary);
      }
      return { status: "sat", model: out };
    }
    const why = String(solver.reasonUnknown?.() ?? "unknown");
    if (/timeout|canceled|cancelled/i.test(why)) return { status: "unknown", reason: "solver-timeout" };
    return { status: "unknown", reason: `solver-unknown: ${why}` };
  } catch (err) {
    return { status: "unknown", reason: `solver-error: ${(err as Error).message}` };
  }
}
