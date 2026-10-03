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

export type Method = "ApprovedBinding" | "BoundaryWitness" | "SolverCheck";
export type Rejection = "MockOnly";
export const METHODS: readonly Method[] = ["ApprovedBinding", "BoundaryWitness", "SolverCheck"];
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

export interface Reserved {
  kind: "architecture" | "temporal";
  name: string;
  native: unknown;
  cites?: Cite[];
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
