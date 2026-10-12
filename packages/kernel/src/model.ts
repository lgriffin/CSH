// The model (csh-ir/v1) and expressions (csh-predicate-v1).
// Single source of these types: Semantic contract, sections 1 and 2.

export type Digest = string; // "sha256:<64 hex>"

export interface Module {
  schema: "csh-ir/v1";
  system: string;
  uses: PackUse[];
  vocabulary: Vocabulary;
  transitions: Transition[];
  policies: Policy[];
  intents: Intent[];
  sources: Source[];
  claims: ClaimSet[];
  bindings: Binding[];
  /** Stage 8: explicit, owned relaxations of inherited obligations (main tab, section 6.3, rule 5). */
  relaxations?: Relaxation[];
}

export interface PackUse {
  pack: string;
  version: string;
  digest: Digest;
}

export interface UnitDecl {
  id: string;
  dimension: string;
  symbol: string;
}

export interface EnumDecl {
  name: string;
  members: string[];
}

export interface StateDecl {
  name: string;
  fields: Record<string, Type>;
}

export interface EventDecl {
  name: string;
  on: string;
  args: Record<string, Type>;
  returns?: Type;
  /**
   * Stated by name: the event gives one outcome for one input (Anchor, harnesses and A3, section 6.1). Present only
   * when true. Two examples with identical inputs whose outcomes cannot both hold are then a conflict, not a divergence.
   */
  deterministic?: true;
}

export interface Vocabulary {
  units: UnitDecl[];
  enums: EnumDecl[];
  states: StateDecl[];
  events: EventDecl[];
}

export type Type =
  | { kind: "int"; unit?: string }
  | { kind: "bool" }
  | { kind: "enum"; enum: string };

export interface Transition {
  event: string;
  when: Expr;
  then: Expr;
  otherwise?: Expr;
}

export type Method = "ApprovedBinding" | "BoundaryWitness" | "SolverCheck" | "FactsCurrent";
export type Rejection = "MockOnly";
export const METHODS: readonly Method[] = ["ApprovedBinding", "BoundaryWitness", "SolverCheck", "FactsCurrent"];
export const REJECTIONS: readonly Rejection[] = ["MockOnly"];

export interface Policy {
  name: string;
  require: Method[];
  reject: Rejection[];
  /** Authority tab, section 6: optional criticality flag. */
  critical?: boolean;
}

export interface Intent {
  name: string;
  owner: string;
  value: string;
  assurance: string;
  assumptions: Assumption[];
  obligations: Obligation[];
  examples: Example[];
}

export interface Source {
  name: string;
  kind: string;
  at: string;
}

export interface Unliftable {
  span: string;
  reason: string;
  text: string;
}

export interface ClaimSet {
  source: string;
  assumptions: Assumption[];
  obligations: Obligation[];
  examples: Example[];
  unliftable: Unliftable[];
}

export interface Cite {
  source: string;
  id: string;
}

export interface Assumption {
  name: string;
  body: Expr;
}

export type Obligation = Invariant | Requirement | Reserved;

export interface Invariant {
  kind: "invariant";
  name: string;
  state: string;
  body: Expr;
  cites?: Cite[];
}

export interface Requirement {
  kind: "requirement";
  name: string;
  event: string;
  while?: Expr;
  and?: Expr;
  shall: Expr;
  ensures: Expr[];
  cites?: Cite[];
}

/**
 * An architecture or temporal obligation. An architecture obligation whose value is an ArchRule is evaluated (Next
 * layers, section 4.1); any other value, and every temporal obligation, stays reserved: carried, never evaluated.
 */
export interface Reserved {
  kind: "architecture" | "temporal";
  name: string;
  native: unknown;
  cites?: Cite[];
}

/** What an architecture rule is about: one package, the packages a container of the diagram holds, or any package. */
export type ArchSel =
  | { k: "package"; name: string }
  | { k: "container"; id: string }
  | { k: "any" }
  /**
   * Source files by path, from the repository root: those matching a glob and no exception (stage 23). With `values`,
   * a dependency that imports types alone does not count when the selector is a rule's subject (stage 39).
   */
  | { k: "modules"; globs: string[]; except?: string[]; values?: true };

/**
 * A proposition about the code that facts can decide (Ingesting a codebase, stage 24). `file`: the repository tracks
 * the path. `declares`: the module declares the name at its top level. `exports`: the module exports the name.
 * `inherits`: the class extends the base, directly or through other classes, by name. `field`: a JSON file holds the
 * value at the pointer. `count`: the value at the pointer has that many entries, less the ones excepted. `script`:
 * package.json names the npm script. `same`: two constants have the same literal value. `total`: the declaration maps
 * every member of the closed type `over` in a construct the language's compiler checks for completeness (The Assertion
 * Ladder, stage 49). `atom`: a named proposition no fact decides, which two sources can still contradict.
 */
export type Prop =
  | { k: "file"; path: string }
  | { k: "declares"; module: string; symbol: string }
  | { k: "exports"; module: string; symbol: string }
  | { k: "inherits"; cls: string; base: string }
  | { k: "field"; file: string; pointer: string; value: string }
  | { k: "count"; file: string; pointer: string; n: number; except?: string[] }
  /** The number of modules read that a modules selector selects (stage 39). */
  | { k: "count-modules"; globs: string[]; except?: string[]; n: number }
  | { k: "script"; name: string }
  | { k: "same"; a: { module: string; name: string }; b: { module: string; name: string } }
  | { k: "total"; module: string; symbol: string; over: string }
  | { k: "atom"; name: string };

/**
 * A structural claim (stage 24): a source asserts a proposition, or with `holds: false` its negation. `at` is the span
 * of the prose that says so.
 */
export interface Claim {
  k: "claim";
  holds: boolean;
  p: Prop;
  at?: string;
}

/**
 * The typed architecture rules (Next layers, section 4.1), and structural claims (stage 24). `reaches` follows chains
 * of dependencies; `acyclic` forbids cycles among the selected modules, or between the groups `group` makes (stage 39).
 */
export type ArchRule = { k: "forbid"; from: ArchSel; to: ArchSel; reaches?: true } | { k: "only"; from: ArchSel; to: ArchSel[] } | { k: "closed"; source: string } | { k: "acyclic"; within: ArchSel; group?: string } | Claim;

const nonEmpty = (x: unknown): x is string => typeof x === "string" && x !== "";

export function isArchSel(x: unknown): x is ArchSel {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (o.k === "package") return nonEmpty(o.name) && Object.keys(o).length === 2;
  if (o.k === "container") return nonEmpty(o.id) && Object.keys(o).length === 2;
  if (o.k === "modules") {
    const globs = (x: unknown) => Array.isArray(x) && x.length > 0 && x.every(nonEmpty);
    return globs(o.globs) && (o.except === undefined || globs(o.except)) && (o.values === undefined || o.values === true) && Object.keys(o).every((k) => ["k", "globs", "except", "values"].includes(k));
  }
  return o.k === "any" && Object.keys(o).length === 1;
}

export function isProp(x: unknown): x is Prop {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  const keys = (...ks: string[]) => Object.keys(o).every((k) => k === "k" || ks.includes(k));
  const constant = (c: unknown) => typeof c === "object" && c !== null && nonEmpty((c as Record<string, unknown>).module) && nonEmpty((c as Record<string, unknown>).name) && Object.keys(c).length === 2;
  switch (o.k) {
    case "file":
      return nonEmpty(o.path) && keys("path");
    case "declares":
    case "exports":
      return nonEmpty(o.module) && nonEmpty(o.symbol) && keys("module", "symbol");
    case "inherits":
      return nonEmpty(o.cls) && nonEmpty(o.base) && keys("cls", "base");
    case "field":
      return nonEmpty(o.file) && typeof o.pointer === "string" && typeof o.value === "string" && keys("file", "pointer", "value");
    case "count":
      return nonEmpty(o.file) && typeof o.pointer === "string" && Number.isInteger(o.n) && (o.n as number) >= 0 && (o.except === undefined || (Array.isArray(o.except) && o.except.every(nonEmpty))) && keys("file", "pointer", "n", "except");
    case "count-modules":
      return Array.isArray(o.globs) && o.globs.length > 0 && o.globs.every(nonEmpty) && (o.except === undefined || (Array.isArray(o.except) && o.except.every(nonEmpty))) && Number.isInteger(o.n) && (o.n as number) >= 0 && keys("globs", "except", "n");
    case "script":
      return nonEmpty(o.name) && keys("name");
    case "same":
      return constant(o.a) && constant(o.b) && keys("a", "b");
    case "total":
      return nonEmpty(o.module) && nonEmpty(o.symbol) && nonEmpty(o.over) && keys("module", "symbol", "over");
    case "atom":
      return nonEmpty(o.name) && keys("name");
    default:
      return false;
  }
}

/** A value that claims to be an architecture rule: an object whose k names one of the forms. */
export function claimsArchRule(x: unknown): boolean {
  return typeof x === "object" && x !== null && !Array.isArray(x) && ["forbid", "only", "closed", "acyclic", "claim"].includes((x as { k?: unknown }).k as string);
}

export function isArchRule(x: unknown): x is ArchRule {
  if (!claimsArchRule(x)) return false;
  const o = x as Record<string, unknown>;
  if (o.k === "claim") return typeof o.holds === "boolean" && isProp(o.p) && (o.at === undefined || nonEmpty(o.at)) && Object.keys(o).every((k) => ["k", "holds", "p", "at"].includes(k));
  if (o.k === "forbid") return isArchSel(o.from) && isArchSel(o.to) && (o.reaches === undefined || o.reaches === true) && Object.keys(o).every((k) => ["k", "from", "to", "reaches"].includes(k));
  if (o.k === "acyclic") return isArchSel(o.within) && (o.group === undefined || nonEmpty(o.group)) && Object.keys(o).every((k) => ["k", "within", "group"].includes(k));
  if (o.k === "only") return isArchSel(o.from) && Array.isArray(o.to) && o.to.every(isArchSel) && Object.keys(o).length === 3;
  return nonEmpty(o.source) && Object.keys(o).length === 2;
}

export interface Example {
  name: string;
  event: string;
  given: Record<string, Expr>;
  args: Record<string, Expr>;
  then: Expr;
  cites?: Cite[];
}

export interface Binding {
  target: Ref;
  key: string;
}

export type Ref =
  | { k: "field"; state: string; field: string }
  | { k: "arg"; event: string; name: string }
  | { k: "result"; event: string };

export interface Relaxation {
  /** Qualified name of the inherited obligation being relaxed. */
  obligation: string;
  owner: string;
  reason: string;
}

export type At = "now" | "pre" | "post";

export type Expr =
  | { k: "int"; v: string; unit?: string }
  | { k: "bool"; v: boolean }
  | { k: "enum"; enum: string; member: string }
  | { k: "field"; state: string; field: string; at: At }
  | { k: "arg"; event: string; name: string }
  | { k: "result"; event: string }
  | { k: "add" | "sub"; l: Expr; r: Expr }
  | { k: "eq" | "ne" | "lt" | "le" | "gt" | "ge"; l: Expr; r: Expr }
  | { k: "and" | "or"; xs: Expr[] }
  | { k: "not"; x: Expr }
  | { k: "implies"; l: Expr; r: Expr };

export type CmpOp = "eq" | "ne" | "lt" | "le" | "gt" | "ge";

export function emptyVocabulary(): Vocabulary {
  return { units: [], enums: [], states: [], events: [] };
}

export function emptyModule(system: string): Module {
  return {
    schema: "csh-ir/v1",
    system,
    uses: [],
    vocabulary: emptyVocabulary(),
    transitions: [],
    policies: [],
    intents: [],
    sources: [],
    claims: [],
    bindings: [],
  };
}

export function sameType(a: Type, b: Type): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "int" && b.kind === "int") return (a.unit ?? null) === (b.unit ?? null);
  if (a.kind === "enum" && b.kind === "enum") return a.enum === b.enum;
  return true;
}

export function typeToString(t: Type): string {
  if (t.kind === "int") return t.unit === undefined ? "int" : `int<${t.unit}>`;
  if (t.kind === "enum") return `enum<${t.enum}>`;
  return "bool";
}
