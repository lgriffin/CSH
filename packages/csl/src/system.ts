// The system builder (Language reference, sections 2, 4, 9 and 10).
import {
  canonicalModule,
  emptyModule,
  moduleDigest,
  refName,
  type Assumption,
  type Binding,
  type Cite,
  type ClaimSet,
  type Example,
  type Expr,
  type Intent,
  type Method,
  type Module,
  type Obligation,
  type Policy,
  type Ref,
  type Rejection,
  type Type,
  type UnitDecl,
} from "@csh/kernel";
import { type AnyHandle, type Bool, type EnumValue, Handle, type Int, type Phase, type PhaseOf, isHandle, toExpr, wrap } from "./handles.ts";

export class CslError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

// ---------------------------------------------------------------- units and types

export interface UnitFn<U extends string> {
  (value: number | bigint): Int<U, never>;
  readonly id: U;
  readonly dimension: string;
  readonly symbol: string;
}

declare const TYPE_PHANTOM: unique symbol;

export interface IntType<U extends string | undefined> {
  readonly kind: "int";
  readonly unit: UnitFn<any> | undefined;
  readonly [TYPE_PHANTOM]?: [U];
}
export interface BoolType {
  readonly kind: "bool";
}
export interface EnumTypeDesc<N extends string> {
  readonly kind: "enum";
  readonly enumName: N;
  readonly members: readonly string[];
}
export type EnumType<N extends string, M extends string> = EnumTypeDesc<N> & { readonly [K in M]: EnumValue<N, never> };

export type TypeDesc = IntType<any> | BoolType | EnumTypeDesc<any>;
export type Fields = Record<string, TypeDesc>;

export type HandleOf<T, P extends Phase> = T extends IntType<infer U>
  ? Int<U, P>
  : T extends BoolType
    ? Bool<P>
    : T extends EnumTypeDesc<infer N>
      ? EnumValue<N, P>
      : never;

export type LiteralOf<T> = HandleOf<T, never>;

function checkSafe(value: number | bigint, what: string): string {
  if (typeof value === "bigint") return value.toString();
  if (!Number.isSafeInteger(value)) throw new CslError("E-INT", `${what}: ${value} is not a safe integer; use a bigint`);
  return String(value);
}

export function unit<D extends string, S extends string>(dimension: D, symbol: S): UnitFn<`${D}(${S})`> {
  const id = `${dimension}(${symbol})` as `${D}(${S})`;
  const fn = ((value: number | bigint) => wrap({ k: "int", v: checkSafe(value, id), unit: id })) as UnitFn<`${D}(${S})`>;
  Object.defineProperties(fn, {
    id: { value: id, enumerable: true },
    dimension: { value: dimension, enumerable: true },
    symbol: { value: symbol, enumerable: true },
  });
  return fn;
}

/** Unitless integer literal. */
export function lit(value: number | bigint): Int<undefined, never> {
  return wrap({ k: "int", v: checkSafe(value, "literal") });
}

export function int<U extends string>(unit: UnitFn<U>): IntType<U>;
export function int(): IntType<undefined>;
export function int(u?: UnitFn<any>): IntType<any> {
  return { kind: "int", unit: u };
}

export function bool(): BoolType {
  return { kind: "bool" };
}

// ---------------------------------------------------------------- references

const STATE = Symbol.for("csl.state");
const EVENT = Symbol.for("csl.event");
const SOURCE = Symbol.for("csl.source");
export const MODULE_BRAND = Symbol.for("csl.module");
export const COMPOSITION = Symbol.for("csl.composition");

interface StateMeta<N extends string, F extends Fields> {
  name: N;
  fields: F;
}
export type StateRef<N extends string, F extends Fields> = { readonly [K in keyof F]: HandleOf<F[K], "now"> } & {
  readonly [STATE]: StateMeta<N, F>;
};
type StateAt<F extends Fields, P extends Phase> = { readonly [K in keyof F]: HandleOf<F[K], P> };

interface EventMeta {
  name: string;
  state: string;
  stateFields: Fields;
  args: Fields;
  returns: TypeDesc | undefined;
}

export interface EventCall<E> {
  readonly event: string;
  readonly args: Record<string, Expr>;
  readonly __e?: E;
}

type ArgLits<A extends Fields> = { readonly [K in keyof A]: LiteralOf<A[K]> };

export type EventRef<N extends string, S extends StateRef<any, any>, A extends Fields, R extends TypeDesc | undefined> = {
  (args: ArgLits<A>): EventCall<EventRef<N, S, A, R>>;
  readonly args: { readonly [K in keyof A]: HandleOf<A[K], "arg"> };
  readonly result: R extends TypeDesc ? HandleOf<R, "result"> : never;
  readonly [EVENT]: EventMeta;
  readonly __types?: [N, S, A, R];
};

type AnyEvent = EventRef<any, any, any, any>;
type StateFieldsOf<E> = E extends EventRef<any, infer S, any, any> ? (S extends StateRef<any, infer F> ? F : never) : never;
type ArgsOfE<E> = E extends EventRef<any, any, infer A, any> ? A : never;
type ResultOfE<E> = E extends EventRef<any, any, any, infer R> ? (R extends TypeDesc ? HandleOf<R, "result"> : never) : never;

export interface StepHandles<E> {
  pre: StateAt<StateFieldsOf<E>, "pre">;
  post: StateAt<StateFieldsOf<E>, "post">;
  args: { readonly [K in keyof ArgsOfE<E>]: HandleOf<ArgsOfE<E>[K], "arg"> };
  result: ResultOfE<E>;
}

export interface SourceRef {
  readonly name: string;
  readonly [SOURCE]: true;
}

export interface Cites {
  cites?: { source: SourceRef; id: string }[];
}

export interface Pack {
  readonly name: string;
  readonly version: string;
  readonly digest: string;
  readonly module: Module;
}

type BindTarget<T> = [PhaseOf<T>] extends [never] ? never : T;

export interface ClaimBuilder {
  assume(name: string, body: Bool<"now" | "arg">): void;
  invariant(name: string, body: Bool<"now">, opts?: Cites): void;
  requirement<E extends AnyEvent>(
    name: string,
    spec: {
      when: E;
      while?: (h: Pick<StepHandles<E>, "pre">) => Bool<"pre">;
      and?: (h: Pick<StepHandles<E>, "pre" | "args">) => Bool<"pre" | "arg">;
      shall: (h: StepHandles<E>) => Bool<Phase>;
      ensures?: (h: StepHandles<E>) => Bool<Phase> | Bool<Phase>[];
    } & Cites,
  ): void;
  example<E extends AnyEvent>(
    name: string,
    spec: {
      given: Partial<{ readonly [K in keyof StateFieldsOf<E>]: LiteralOf<StateFieldsOf<E>[K]> }>;
      when: EventCall<E>;
      then: (h: StepHandles<E>) => Bool<Phase>;
    } & Cites,
  ): void;
  /** Reserved in version 1: carried and reported, never evaluated. */
  architecture(name: string, native: unknown, opts?: Cites): void;
  temporal(name: string, native: unknown, opts?: Cites): void;
}

export interface SystemBuilder {
  enum<N extends string, const M extends string>(name: N, members: readonly M[]): EnumType<N, M>;
  state<N extends string, F extends Fields>(name: N, fields: F): StateRef<N, F>;
  event<N extends string, S extends StateRef<any, any>, A extends Fields, R extends TypeDesc | undefined = undefined>(
    name: N,
    spec: { on: S; args: A; returns?: R; deterministic?: boolean },
  ): EventRef<N, S, A, R>;
  transition<E extends AnyEvent>(
    event: E,
    body: (h: StepHandles<E>) => {
      when: Bool<"pre" | "arg">;
      then: Bool<"pre" | "post" | "arg" | "result">;
      otherwise?: Bool<"pre" | "post" | "arg" | "result">;
    },
  ): void;
  policy(
    name: string,
    spec: { require: readonly (Method | (string & {}))[]; reject?: readonly (Rejection | (string & {}))[]; critical?: boolean },
  ): void;
  intent(name: string, meta: { owner: string; value: string; assurance: string }, build: (i: ClaimBuilder) => void): void;
  source(name: string, spec: { kind: string; at: string }): SourceRef;
  claims(source: SourceRef, build: (c: ClaimBuilder) => void): void;
  bind<T extends AnyHandle>(target: BindTarget<T>, key: string): void;
  use(pack: Pack): void;
  /** Stage 8: an explicit, owned relaxation of an inherited obligation (main tab, section 6.3, rule 5). */
  relax(obligation: string, spec: { owner: string; reason: string }): void;
}

// ---------------------------------------------------------------- composition metadata

export interface CompositionError {
  code: "E-VOCAB" | "E-COMPOSE";
  message: string;
}
export interface Shadowed {
  intent: string;
  name: string;
  pack: string;
  inherited: Obligation;
  local: Obligation;
}
export interface CompositionInfo {
  errors: CompositionError[];
  shadowed: Shadowed[];
  /** Qualified obligation names inherited from packs, with their pack. */
  inherited: { name: string; pack: string }[];
}

// ---------------------------------------------------------------- implementation

function typeOf(t: TypeDesc, units: Map<string, UnitDecl>): Type {
  if (t === undefined || t === null || typeof t !== "object") throw new CslError("E-TYPE", "missing type descriptor");
  if (t.kind === "int") {
    if (t.unit === undefined) return { kind: "int" };
    units.set(t.unit.id, { id: t.unit.id, dimension: t.unit.dimension, symbol: t.unit.symbol });
    return { kind: "int", unit: t.unit.id };
  }
  if (t.kind === "bool") return { kind: "bool" };
  return { kind: "enum", enum: (t as EnumTypeDesc<string>).enumName };
}

function unitsIn(e: unknown, units: Map<string, UnitDecl>, known: Map<string, UnitDecl>): void {
  if (typeof e !== "object" || e === null) return;
  const x = e as Record<string, unknown>;
  if (x.k === "int" && typeof x.unit === "string" && !units.has(x.unit)) {
    const k = known.get(x.unit);
    const m = /^(.*)\((.*)\)$/.exec(x.unit);
    if (k !== undefined) units.set(x.unit, k);
    else if (m !== null) units.set(x.unit, { id: x.unit, dimension: m[1]!, symbol: m[2]! });
  }
  for (const v of Object.values(x)) {
    if (Array.isArray(v)) v.forEach((y) => unitsIn(y, units, known));
    else if (typeof v === "object") unitsIn(v, units, known);
  }
}

function stateHandles(name: string, fields: Fields, at: "now" | "pre" | "post"): Record<string, Handle> {
  const out: Record<string, Handle> = {};
  for (const f of Object.keys(fields)) out[f] = new Handle({ k: "field", state: name, field: f, at });
  return out;
}

function stepHandles(meta: EventMeta): StepHandles<any> {
  const args: Record<string, Handle> = {};
  for (const a of Object.keys(meta.args)) args[a] = new Handle({ k: "arg", event: meta.name, name: a });
  return {
    pre: stateHandles(meta.state, meta.stateFields, "pre") as never,
    post: stateHandles(meta.state, meta.stateFields, "post") as never,
    args: args as never,
    result: new Handle({ k: "result", event: meta.name }) as never,
  };
}

function eventMeta(e: unknown): EventMeta {
  const m = (e as Record<symbol, EventMeta> | undefined)?.[EVENT];
  if (m === undefined) throw new CslError("E-EVENT", "expected an event declared with s.event");
  return m;
}

function citesOf(opts: Cites | undefined): Cite[] | undefined {
  if (opts?.cites === undefined) return undefined;
  return opts.cites.map((c) => ({ source: c.source.name, id: c.id }));
}

function collectFieldStates(e: unknown, out: Set<string>): void {
  if (typeof e !== "object" || e === null) return;
  const x = e as Record<string, unknown>;
  if (x.k === "field" && typeof x.state === "string") out.add(x.state);
  for (const v of Object.values(x)) {
    if (Array.isArray(v)) v.forEach((y) => collectFieldStates(y, out));
    else if (typeof v === "object") collectFieldStates(v, out);
  }
}

function refFromHandle(h: unknown): Ref {
  const e = isHandle(h) ? h.expr : undefined;
  if (e?.k === "field") return { k: "field", state: e.state, field: e.field };
  if (e?.k === "arg") return { k: "arg", event: e.event, name: e.name };
  if (e?.k === "result") return { k: "result", event: e.event };
  return { k: "invalid" } as unknown as Ref;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function makeClaimBuilder(
  target: { assumptions: Assumption[]; obligations: Obligation[]; examples: Example[] },
  states: () => string[],
): ClaimBuilder {
  return {
    assume(name, body) {
      target.assumptions.push({ name, body: toExpr(body) });
    },
    invariant(name, body, opts) {
      const expr = toExpr(body);
      const found = new Set<string>();
      collectFieldStates(expr, found);
      const all = states();
      const state = [...found][0] ?? (all.length === 1 ? all[0]! : "");
      const o: Obligation = { kind: "invariant", name, state, body: expr };
      const c = citesOf(opts);
      if (c !== undefined) o.cites = c;
      target.obligations.push(o);
    },
    requirement(name, spec) {
      const meta = eventMeta(spec.when);
      const h = stepHandles(meta);
      const o: Obligation = {
        kind: "requirement",
        name,
        event: meta.name,
        shall: toExpr(spec.shall(h)),
        ensures: [],
      };
      if (spec.while !== undefined) o.while = toExpr(spec.while(h as never));
      if (spec.and !== undefined) o.and = toExpr(spec.and(h as never));
      if (spec.ensures !== undefined) {
        const r = spec.ensures(h);
        o.ensures = (Array.isArray(r) ? r : [r]).map(toExpr);
      }
      const c = citesOf(spec);
      if (c !== undefined) o.cites = c;
      target.obligations.push(o);
    },
    example(name, spec) {
      const call = spec.when as EventCall<unknown>;
      const meta = eventMeta(call);
      const given: Record<string, Expr> = {};
      for (const [k, v] of Object.entries(spec.given as Record<string, unknown>)) if (v !== undefined) given[k] = toExpr(v);
      const x: Example = { name, event: meta.name, given, args: { ...call.args }, then: toExpr(spec.then(stepHandles(meta))) };
      const c = citesOf(spec);
      if (c !== undefined) x.cites = c;
      target.examples.push(x);
    },
    architecture(name, native, opts) {
      const o: Obligation = { kind: "architecture", name, native: native ?? null };
      const c = citesOf(opts);
      if (c !== undefined) o.cites = c;
      target.obligations.push(o);
    },
    temporal(name, native, opts) {
      const o: Obligation = { kind: "temporal", name, native: native ?? null };
      const c = citesOf(opts);
      if (c !== undefined) o.cites = c;
      target.obligations.push(o);
    },
  };
}

/** Build a module. The callback runs exactly once, with symbolic handles. */
export function system(name: string, build: (s: SystemBuilder) => void): Module {
  const m = emptyModule(name);
  const units = new Map<string, UnitDecl>();
  const composition: CompositionInfo = { errors: [], shadowed: [], inherited: [] };
  const packIntents = new Map<string, { pack: string; names: Set<string> }>();
  const localIntents = new Set<string>();
  const relaxed: { obligation: string; owner: string; reason: string }[] = [];

  const s: SystemBuilder = {
    enum(enumName, members) {
      m.vocabulary.enums.push({ name: enumName, members: [...members] });
      const out: Record<string, unknown> = { kind: "enum", enumName, members: [...members] };
      for (const mem of members) out[mem] = new Handle({ k: "enum", enum: enumName, member: mem });
      return out as never;
    },
    state(stateName, fields) {
      const decl: Record<string, Type> = {};
      for (const [f, t] of Object.entries(fields)) decl[f] = typeOf(t, units);
      m.vocabulary.states.push({ name: stateName, fields: decl });
      const out = stateHandles(stateName, fields, "now") as Record<string | symbol, unknown>;
      Object.defineProperty(out, STATE, { value: { name: stateName, fields }, enumerable: false });
      return out as never;
    },
    event(eventName, spec) {
      const st = (spec.on as Record<symbol, StateMeta<string, Fields>>)[STATE];
      if (st === undefined) throw new CslError("E-EVENT", `event ${eventName}: on must be a state declared with s.state`);
      const args: Record<string, Type> = {};
      for (const [a, t] of Object.entries(spec.args)) args[a] = typeOf(t, units);
      const decl: Module["vocabulary"]["events"][number] = { name: eventName, on: st.name, args };
      if (spec.returns !== undefined) decl.returns = typeOf(spec.returns, units);
      if (spec.deterministic !== undefined && typeof spec.deterministic !== "boolean") throw new CslError("E-EVENT", `event ${eventName}: deterministic is true or false`);
      if (spec.deterministic === true) decl.deterministic = true;
      m.vocabulary.events.push(decl);
      const meta: EventMeta = { name: eventName, state: st.name, stateFields: st.fields, args: spec.args, returns: spec.returns };
      const fn = (callArgs: Record<string, unknown>) => {
        const lits: Record<string, Expr> = {};
        for (const [k, v] of Object.entries(callArgs)) lits[k] = toExpr(v);
        const call = { event: eventName, args: lits };
        Object.defineProperty(call, EVENT, { value: meta, enumerable: false });
        return call;
      };
      const argHandles: Record<string, Handle> = {};
      for (const a of Object.keys(spec.args)) argHandles[a] = new Handle({ k: "arg", event: eventName, name: a });
      Object.defineProperty(fn, "args", { value: argHandles, enumerable: true });
      Object.defineProperty(fn, "result", { value: new Handle({ k: "result", event: eventName }), enumerable: true });
      Object.defineProperty(fn, EVENT, { value: meta, enumerable: false });
      return fn as never;
    },
    transition(event, body) {
      const meta = eventMeta(event);
      const r = body(stepHandles(meta));
      const t: Module["transitions"][number] = { event: meta.name, when: toExpr(r.when), then: toExpr(r.then) };
      if (r.otherwise !== undefined) t.otherwise = toExpr(r.otherwise);
      m.transitions.push(t);
    },
    policy(policyName, spec) {
      const p: Policy = { name: policyName, require: [...spec.require] as Method[], reject: [...(spec.reject ?? [])] as Rejection[] };
      if (spec.critical !== undefined) p.critical = spec.critical;
      m.policies.push(p);
    },
    intent(intentName, meta, b) {
      localIntents.add(intentName);
      let i = m.intents.find((x) => x.name === intentName && packIntents.has(x.name));
      if (i !== undefined) {
        if (i.owner !== meta?.owner || i.value !== meta?.value || i.assurance !== meta?.assurance) {
          composition.errors.push({ code: "E-COMPOSE", message: `intent ${intentName} redeclared with different owner, value or assurance than its pack` });
        }
      } else {
        i = {
          name: intentName,
          owner: meta?.owner as string,
          value: meta?.value as string,
          assurance: meta?.assurance as string,
          assumptions: [],
          obligations: [],
          examples: [],
        } as Intent;
        m.intents.push(i);
      }
      const local = { assumptions: [] as Assumption[], obligations: [] as Obligation[], examples: [] as Example[] };
      b(makeClaimBuilder(local, () => m.vocabulary.states.map((x) => x.name)));
      const inherited = packIntents.get(intentName);
      for (const o of local.obligations) {
        const prior = inherited?.names.has(o.name) ? i.obligations.find((x) => x.name === o.name) : undefined;
        if (prior !== undefined && inherited !== undefined) {
          composition.shadowed.push({ intent: intentName, name: o.name, pack: inherited.pack, inherited: prior, local: o });
          i.obligations = i.obligations.filter((x) => x !== prior);
        }
        i.obligations.push(o);
      }
      i.assumptions.push(...local.assumptions);
      i.examples.push(...local.examples);
    },
    source(sourceName, spec) {
      m.sources.push({ name: sourceName, kind: spec.kind, at: spec.at });
      return { name: sourceName, [SOURCE]: true } as SourceRef;
    },
    claims(source, b) {
      let cs = m.claims.find((c) => c.source === source.name);
      if (cs === undefined) {
        cs = { source: source.name, assumptions: [], obligations: [], examples: [], unliftable: [] } as ClaimSet;
        m.claims.push(cs);
      }
      b(makeClaimBuilder(cs, () => m.vocabulary.states.map((x) => x.name)));
    },
    bind(target, key) {
      m.bindings.push({ target: refFromHandle(target), key } as Binding);
    },
    use(pack) {
      const pm = pack.module;
      m.uses.push({ pack: pack.name, version: pack.version, digest: pack.digest });
      // Vocabulary merges only when types and units agree (main tab, section 6.3, rule 2).
      const v = m.vocabulary;
      for (const u of pm.vocabulary.units) units.set(u.id, u);
      for (const e of pm.vocabulary.enums) {
        const have = v.enums.find((x) => x.name === e.name);
        if (have === undefined) v.enums.push(e);
        else if (!sameJson(have.members, e.members)) composition.errors.push({ code: "E-VOCAB", message: `enumeration ${e.name} disagrees with pack ${pack.name}` });
      }
      for (const st of pm.vocabulary.states) {
        const have = v.states.find((x) => x.name === st.name);
        if (have === undefined) v.states.push({ name: st.name, fields: { ...st.fields } });
        else
          for (const [f, t] of Object.entries(st.fields)) {
            if (have.fields[f] === undefined) have.fields[f] = t;
            else if (!sameJson(have.fields[f], t)) composition.errors.push({ code: "E-VOCAB", message: `field ${st.name}.${f} disagrees in type or unit with pack ${pack.name}` });
          }
      }
      for (const ev of pm.vocabulary.events) {
        const have = v.events.find((x) => x.name === ev.name);
        if (have === undefined) v.events.push(ev);
        else if (!sameJson(canonicalModule({ ...emptyModule("X"), vocabulary: { units: [], enums: [], states: [], events: [have] } }).vocabulary.events, canonicalModule({ ...emptyModule("X"), vocabulary: { units: [], enums: [], states: [], events: [ev] } }).vocabulary.events)) {
          composition.errors.push({ code: "E-VOCAB", message: `event ${ev.name} disagrees with pack ${pack.name}` });
        }
      }
      m.transitions.push(...pm.transitions);
      for (const p of pm.policies) {
        const have = m.policies.find((x) => x.name === p.name);
        if (have === undefined) m.policies.push(p);
        else if (!sameJson(have, p)) composition.errors.push({ code: "E-COMPOSE", message: `policy ${p.name} disagrees with pack ${pack.name}` });
      }
      for (const i of pm.intents) {
        if (m.intents.some((x) => x.name === i.name)) {
          composition.errors.push({ code: "E-COMPOSE", message: `intent ${i.name} from pack ${pack.name} already exists` });
          continue;
        }
        m.intents.push({ ...i, assumptions: [...i.assumptions], obligations: [...i.obligations], examples: [...i.examples] });
        packIntents.set(i.name, { pack: pack.name, names: new Set(i.obligations.map((o) => o.name)) });
        for (const o of i.obligations) composition.inherited.push({ name: `${name}/${i.name}/${o.name}`, pack: pack.name });
      }
      m.sources.push(...pm.sources);
      m.claims.push(...pm.claims);
      m.bindings.push(...pm.bindings);
    },
    relax(obligation, spec) {
      relaxed.push({ obligation, owner: spec.owner, reason: spec.reason });
    },
  };

  build(s);

  // Explicit relaxations remove an inherited obligation from the conjunction and stay recorded.
  for (const r of relaxed) {
    const [, intentName, oblName] = r.obligation.split("/");
    const i = m.intents.find((x) => x.name === intentName);
    const isInherited = composition.inherited.some((x) => x.name === r.obligation);
    if (i === undefined || oblName === undefined || !isInherited) {
      composition.errors.push({ code: "E-COMPOSE", message: `relax names ${r.obligation}, which is not an inherited obligation` });
      continue;
    }
    const shadow = composition.shadowed.find((x) => `${name}/${x.intent}/${x.name}` === r.obligation);
    if (shadow !== undefined) composition.shadowed = composition.shadowed.filter((x) => x !== shadow);
    else i.obligations = i.obligations.filter((o) => o.name !== oblName);
    (m.relaxations ??= []).push(r);
  }

  // Units referenced anywhere (literals included) are declared in the vocabulary.
  const all = new Map(units);
  unitsIn(m, units, all);
  m.vocabulary.units = [...units.values()];
  void localIntents;
  Object.defineProperty(m, MODULE_BRAND, { value: true, enumerable: false });
  Object.defineProperty(m, COMPOSITION, { value: composition, enumerable: false });
  return m;
}

/** Declare a pack from an emitted system: a name, an exact version and the digest of its model. */
export function definePack(module: Module, version: string): Pack {
  return { name: module.system, version, digest: moduleDigest(module), module: canonicalModule(module) };
}

export function isModule(x: unknown): x is Module {
  return typeof x === "object" && x !== null && (x as Record<symbol, unknown>)[MODULE_BRAND] === true;
}

export function compositionOf(m: Module): CompositionInfo | undefined {
  return (m as unknown as Record<symbol, CompositionInfo | undefined>)[COMPOSITION];
}

export { refName };
