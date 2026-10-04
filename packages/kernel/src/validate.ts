// Checks on an emitted model: rules S1 to S8 as far as they can be seen in the IR,
// the phase table, and naming (Language reference, sections 6 and 7; main tab, section 7.3).
import { refName } from "./canonical.ts";
import type { Assumption, ClaimSet, Example, Expr, Module, Obligation, Type, Vocabulary } from "./model.ts";
import { type ArchRule, claimsArchRule, isArchRule, METHODS, REJECTIONS, sameType } from "./model.ts";
import { collectRefs } from "./refs.ts";
import { checkBool, isExprShape, type ExprTypeError, type Position, type TypeErrorCode, typeExpr } from "./typing.ts";

export type RuleId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "E-DUP" | "E-NAME" | "E-VOCAB";

export interface RuleViolation {
  rule: RuleId;
  path: string;
  message: string;
  /** The typing error code, when the violation came from expression typing. */
  code?: TypeErrorCode;
}

const UPPER = /^[A-Z][A-Za-z0-9]*$/;
const LOWER = /^[a-z][A-Za-z0-9]*$/;

export function ruleOfTypeError(code: TypeErrorCode): RuleId {
  switch (code) {
    case "raw-value":
    case "bad-literal":
      return "S6";
    case "unknown-term":
    case "foreign-term":
      return "S1";
    case "unit-mismatch":
    case "type-mismatch":
      return "S2";
    case "phase":
      return "S3";
  }
}

class Collector {
  readonly out: RuleViolation[] = [];
  add(rule: RuleId, path: string, message: string, code?: TypeErrorCode): void {
    const v: RuleViolation = { rule, path, message };
    if (code !== undefined) v.code = code;
    this.out.push(v);
  }
  typed(path: string, errs: ExprTypeError[]): void {
    for (const e of errs) this.add(ruleOfTypeError(e.code), path, e.message, e.code);
  }
}

function dupCheck(c: Collector, names: string[], path: string, kind: string): void {
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) c.add("E-DUP", path, `duplicate ${kind} name ${n}`);
    seen.add(n);
  }
}

function nameCheck(c: Collector, name: unknown, re: RegExp, path: string, kind: string): void {
  if (typeof name !== "string" || !re.test(name)) c.add("E-NAME", path, `${kind} name ${JSON.stringify(name)} does not match ${re.source}`);
}

function typeWellFormed(c: Collector, v: Vocabulary, t: Type | undefined, path: string): void {
  if (t === undefined || typeof t !== "object") {
    c.add("S6", path, "missing type descriptor");
    return;
  }
  if (t.kind === "int" && t.unit !== undefined && !v.units.some((u) => u.id === t.unit)) c.add("S1", path, `unknown unit ${t.unit}`);
  if (t.kind === "enum" && !v.enums.some((e) => e.name === t.enum)) c.add("S1", path, `unknown enumeration ${t.enum}`);
}

export function validateVocabulary(v: Vocabulary, c: Collector = new Collector()): RuleViolation[] {
  dupCheck(c, v.units.map((u) => u.id), "vocabulary.units", "unit");
  dupCheck(c, v.enums.map((e) => e.name), "vocabulary.enums", "enumeration");
  dupCheck(c, v.states.map((s) => s.name), "vocabulary.states", "state");
  dupCheck(c, v.events.map((e) => e.name), "vocabulary.events", "event");
  for (const e of v.enums) {
    nameCheck(c, e.name, UPPER, `enum ${e.name}`, "enumeration");
    dupCheck(c, e.members, `enum ${e.name}`, "member");
  }
  for (const s of v.states) {
    nameCheck(c, s.name, UPPER, `state ${s.name}`, "state");
    for (const [f, t] of Object.entries(s.fields)) {
      nameCheck(c, f, LOWER, `state ${s.name}.${f}`, "field");
      typeWellFormed(c, v, t, `state ${s.name}.${f}`);
    }
  }
  for (const e of v.events) {
    nameCheck(c, e.name, UPPER, `event ${e.name}`, "event");
    if (!v.states.some((s) => s.name === e.on)) c.add("S1", `event ${e.name}`, `event acts on unknown state ${e.on}`);
    for (const [a, t] of Object.entries(e.args)) {
      nameCheck(c, a, LOWER, `event ${e.name}.${a}`, "argument");
      typeWellFormed(c, v, t, `event ${e.name}.${a}`);
    }
    if (e.returns !== undefined) typeWellFormed(c, v, e.returns, `event ${e.name}.returns`);
    if ("deterministic" in e && e.deterministic !== true) c.add("S1", `event ${e.name}`, "deterministic is either true or absent");
  }
  return c.out;
}

function checkAt(c: Collector, v: Vocabulary, e: unknown, path: string, position: Position, scope: { event?: string; state?: string }): void {
  const ctx = { vocabulary: v, position, ...scope };
  c.typed(path, checkBool(e, ctx));
}

export function validateAssumption(c: Collector, v: Vocabulary, a: Assumption, path: string): void {
  nameCheck(c, a.name, UPPER, path, "assumption");
  checkAt(c, v, a.body, path, "assumption", {});
}

export function validateObligation(c: Collector, v: Vocabulary, o: Obligation, path: string): void {
  nameCheck(c, o.name, UPPER, path, "obligation");
  if (o.kind === "invariant") {
    if (!v.states.some((s) => s.name === o.state)) c.add("S1", path, `invariant on unknown state ${o.state}`);
    checkAt(c, v, o.body, path, "invariant", { state: o.state });
  } else if (o.kind === "requirement") {
    if (!v.events.some((e) => e.name === o.event)) {
      c.add("S1", path, `requirement on unknown event ${o.event}`);
      return;
    }
    const scope = { event: o.event };
    if (o.while !== undefined) checkAt(c, v, o.while, `${path}.while`, "requirement-while", scope);
    if (o.and !== undefined) checkAt(c, v, o.and, `${path}.and`, "requirement-and", scope);
    checkAt(c, v, o.shall, `${path}.shall`, "step", scope);
    if (!Array.isArray(o.ensures)) c.add("S6", `${path}.ensures`, "ensures must be a list of expressions");
    else o.ensures.forEach((x, i) => checkAt(c, v, x, `${path}.ensures[${i}]`, "step", scope));
  } else if (o.kind === "architecture") {
    if (claimsArchRule(o.native) && !isArchRule(o.native)) c.add("S6", path, `malformed architecture rule ${JSON.stringify(o.native)}`);
  } else if (o.kind !== "temporal") {
    c.add("S6", path, `unknown obligation kind ${JSON.stringify((o as { kind: unknown }).kind)}`);
  }
}

function isLiteral(e: unknown): boolean {
  return isExprShape(e) && (e.k === "int" || e.k === "bool" || e.k === "enum");
}

export function validateExample(c: Collector, v: Vocabulary, x: Example, path: string): void {
  nameCheck(c, x.name, UPPER, path, "example");
  const ev = v.events.find((e) => e.name === x.event);
  if (ev === undefined) {
    c.add("S1", path, `example on unknown event ${x.event}`);
    return;
  }
  const state = v.states.find((s) => s.name === ev.on);
  for (const [f, lit] of Object.entries(x.given)) {
    const ft = state?.fields[f];
    if (ft === undefined) {
      c.add("S1", `${path}.given.${f}`, `unknown field ${ev.on}.${f}`);
      continue;
    }
    if (!isLiteral(lit)) {
      c.add(isExprShape(lit) ? "S3" : "S6", `${path}.given.${f}`, "given values must be literals");
      continue;
    }
    literalType(c, v, lit as Expr, ft, `${path}.given.${f}`);
  }
  for (const [a, lit] of Object.entries(x.args)) {
    const at = ev.args[a];
    if (at === undefined) {
      c.add("S1", `${path}.args.${a}`, `unknown argument ${ev.name}.${a}`);
      continue;
    }
    if (!isLiteral(lit)) {
      c.add(isExprShape(lit) ? "S3" : "S6", `${path}.args.${a}`, "argument values must be literals");
      continue;
    }
    literalType(c, v, lit as Expr, at, `${path}.args.${a}`);
  }
  checkAt(c, v, x.then, `${path}.then`, "step", { event: x.event });
  // S7: an example may assert only what its given and when determine.
  if (isExprShape(x.then)) {
    const refs = collectRefs(x.then);
    for (const f of refs.fields) {
      if (f.at === "pre" && !(f.field in x.given)) {
        c.add("S7", `${path}.then`, `then reads pre ${f.state}.${f.field}, which given does not determine`);
      }
    }
    for (const a of refs.args) {
      if (a.event === x.event && !(a.name in x.args)) {
        c.add("S7", `${path}.then`, `then reads argument ${a.name}, which the call does not supply`);
      }
    }
  }
}

function literalType(c: Collector, v: Vocabulary, lit: Expr, want: Type, path: string): void {
  const r = typeExpr(lit, { vocabulary: v, position: "step" });
  c.typed(path, r.errors);
  if (r.type !== undefined && !sameType(r.type, want)) {
    const code = r.type.kind === "int" && want.kind === "int" ? "unit-mismatch" : "type-mismatch";
    c.add("S2", path, `literal of the wrong type for this field`, code);
  }
}

export function validateClaimSet(c: Collector, v: Vocabulary, cs: ClaimSet, path: string): void {
  dupCheck(c, [...cs.assumptions.map((a) => a.name), ...cs.obligations.map((o) => o.name), ...cs.examples.map((e) => e.name)], path, "fragment");
  cs.assumptions.forEach((a) => validateAssumption(c, v, a, `${path}/${a.name}`));
  cs.obligations.forEach((o) => validateObligation(c, v, o, `${path}/${o.name}`));
  cs.examples.forEach((x) => validateExample(c, v, x, `${path}/${x.name}`));
}

/** All IR-level checks. Compile-time rules S1 to S5 are repeated here so a hand-built IR is held to them too. */
export function validateModule(m: Module): RuleViolation[] {
  const c = new Collector();
  const v = m.vocabulary;
  nameCheck(c, m.system, UPPER, "system", "system");
  validateVocabulary(v, c);
  for (const u of m.uses) {
    if (typeof u.version !== "string" || u.version === "" || /[\^~*xX<>| ]/.test(u.version)) c.add("S8", `uses ${u.pack}`, `pack ${u.pack} is not pinned to an exact version`);
    if (typeof u.digest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(u.digest)) c.add("S8", `uses ${u.pack}`, `pack ${u.pack} has no digest`);
  }
  m.transitions.forEach((t, i) => {
    const path = `transition ${t.event}[${i}]`;
    if (!v.events.some((e) => e.name === t.event)) {
      c.add("S1", path, `transition on unknown event ${t.event}`);
      return;
    }
    checkAt(c, v, t.when, `${path}.when`, "transition-when", { event: t.event });
    checkAt(c, v, t.then, `${path}.then`, "step", { event: t.event });
    if (t.otherwise !== undefined) checkAt(c, v, t.otherwise, `${path}.otherwise`, "step", { event: t.event });
  });
  dupCheck(c, m.policies.map((p) => p.name), "policies", "policy");
  for (const p of m.policies) {
    nameCheck(c, p.name, UPPER, `policy ${p.name}`, "policy");
    for (const r of p.require) if (!METHODS.includes(r)) c.add("S8", `policy ${p.name}`, `policy requires undefined method ${r}`);
    for (const r of p.reject) if (!REJECTIONS.includes(r)) c.add("S8", `policy ${p.name}`, `policy rejects undefined evidence class ${r}`);
  }
  dupCheck(c, m.intents.map((i) => i.name), "intents", "intent");
  for (const i of m.intents) {
    const path = `intent ${i.name}`;
    nameCheck(c, i.name, UPPER, path, "intent");
    if (typeof i.owner !== "string" || i.owner === "") c.add("S4", path, "intent has no owner");
    if (typeof i.value !== "string" || i.value === "") c.add("S4", path, "intent has no value statement");
    if (typeof i.assurance !== "string" || i.assurance === "") c.add("S4", path, "intent has no assurance policy");
    else if (!m.policies.some((p) => p.name === i.assurance)) c.add("S8", path, `intent names undefined policy ${i.assurance}`);
    dupCheck(c, [...i.assumptions.map((a) => a.name), ...i.obligations.map((o) => o.name), ...i.examples.map((e) => e.name)], path, "fragment");
    i.assumptions.forEach((a) => validateAssumption(c, v, a, `${path}/${a.name}`));
    i.obligations.forEach((o) => validateObligation(c, v, o, `${path}/${o.name}`));
    i.examples.forEach((x) => validateExample(c, v, x, `${path}/${x.name}`));
    for (const o of i.obligations) {
      const r = o.kind === "architecture" ? (o.native as ArchRule) : undefined;
      if (r !== undefined && isArchRule(r) && r.k === "closed" && !m.sources.some((s) => s.name === r.source)) c.add("S1", `${path}/${o.name}`, `closed rule on undeclared source ${r.source}`);
    }
  }
  dupCheck(c, m.sources.map((s) => s.name), "sources", "source");
  for (const s of m.sources) nameCheck(c, s.name, UPPER, `source ${s.name}`, "source");
  for (const cs of m.claims) {
    if (!m.sources.some((s) => s.name === cs.source)) c.add("S1", `claims @${cs.source}`, `claims for undeclared source ${cs.source}`);
    validateClaimSet(c, v, cs, `claims @${cs.source}`);
  }
  dupCheck(c, m.bindings.map((b) => refName(b.target)), "bindings", "binding target");
  for (const b of m.bindings) {
    const path = `binding ${refName(b.target)}`;
    const t = b.target;
    if (t.k === "field") {
      if (v.states.find((s) => s.name === t.state)?.fields[t.field] === undefined) c.add("S5", path, "binding target is not a declared state field");
    } else if (t.k === "arg") {
      if (v.events.find((e) => e.name === t.event)?.args[t.name] === undefined) c.add("S5", path, "binding target is not a declared argument");
    } else if (t.k === "result") {
      if (v.events.find((e) => e.name === t.event)?.returns === undefined) c.add("S5", path, "binding target is not a declared result");
    } else {
      c.add("S5", path, "binding target is not a state field, argument or result");
    }
    if (typeof b.key !== "string" || b.key === "") c.add("S5", path, "binding has no key");
  }
  return c.out;
}

export { Collector as ViolationCollector };
