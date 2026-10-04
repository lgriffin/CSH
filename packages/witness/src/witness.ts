// The witness format (csh-witness/v1 and v2), the execution line (csh-execution/v1) and the adapter contract (Evidence
// tab, sections 2 and 4; Anchor, harnesses and A3, sections 3.2, 6.2 and 6.3).
import { canonicalJson, digestOf, type ClaimSet, type Digest, type Binding, type Source, type Vocabulary } from "@csh/kernel";

export type Json = string | number | boolean | null;

export type LocalResult = "passed" | "failed" | "errored";

export interface Witness {
  /** Version 2 makes localResult optional and adds cites; version 1 records are read unchanged. */
  schema: "csh-witness/v1" | "csh-witness/v2";
  id: string;
  event: string;
  args: Record<string, Json>;
  pre: Record<string, Json>;
  post: Record<string, Json>;
  result?: Json;
  execution: {
    test?: string;
    /** Required in version 1. In version 2 it is absent unless known; the test runner's reporter supplies it. */
    localResult?: LocalResult;
    mocked: string[];
  };
  /** Requirement identifiers this witness claims to serve; the practice names the source they belong to (v2). */
  cites?: string[];
  subject: { commit: string; buildDigest?: string; environment: string };
  tool: { id: string; version: string; configDigest?: string };
  recordedAt: string;
}

export interface SourceItem {
  id: string;
  text: string;
  span: string;
  textDigest: string;
  pattern?: string;
}

export interface AdapterManifest {
  id: string;
  version: string;
  ir: "csh-ir/v1";
  produces: ("claims" | "witnesses" | "items" | "diagram" | "facts")[];
  inputKinds: string[];
}

export interface AdapterInput {
  source: Source;
  vocabulary: Vocabulary;
  bindings: (Binding & { authority: string })[];
  files: { path: string; digest: string; bytes: Uint8Array }[];
  /** Adapter-specific settings, such as the identifier pattern of adapter B, or the source a practice cites. */
  config?: Record<string, string>;
  /** The execution file the test runner's reporter wrote, when the source has one (section 3.2). */
  executions?: { path: string; digest: string; bytes: Uint8Array }[];
}

/** One finished test, as the test runner's reporter records it. */
export interface Execution {
  schema: "csh-execution/v1";
  /** Test identity: file relative to the harness's directory, then "::", then the test's full name (A-39). */
  test: string;
  outcome: LocalResult;
}

export interface Diagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  span?: string;
}

/** One element of a container diagram: a container holds the packages its technology field names. */
export interface DiagramElement {
  id: string;
  /** Container, Person, System_Ext and the like, as written. */
  kind: string;
  label: string;
  packages: string[];
  span: string;
}

/** One drawn relation, between element identifiers. */
export interface DiagramRelation {
  from: string;
  to: string;
  label: string;
  span: string;
}

/** What an Architecture source's adapter reads from a diagram (Next layers, section 4.2). */
export interface Diagram {
  elements: DiagramElement[];
  relations: DiagramRelation[];
}

interface FactBase {
  schema: "csh-facts/v1";
  /** Where the fact was read: a manifest, or a file and line. */
  at: string;
  subject: { commit: string };
  tool: { id: string; version: string };
}

/** A package of the workspace, by its manifest name. */
export interface PackageFact extends FactBase {
  kind: "package";
  name: string;
}

/** One dependency between packages of the workspace, from an import statement or a manifest (section 4.2). */
export interface DependencyFact extends FactBase {
  kind: "depends";
  from: string;
  to: string;
  via: "import" | "manifest";
  /** An import of types alone: counted as a dependency, and flagged (A-74). */
  typeOnly: boolean;
}

/** Something the scan saw and could not resolve, such as a dynamic import of a computed specifier. */
export interface SkippedFact extends FactBase {
  kind: "skipped";
  from: string;
  reason: string;
}

/** The fact format (csh-facts/v1), evidence beside the witness format; a fact never carries authority. */
export type Fact = PackageFact | DependencyFact | SkippedFact;

export interface AdapterOutput {
  claims?: ClaimSet;
  /** An Architecture source: the diagram's elements and relations. */
  diagram?: Diagram;
  /** A Facts source: the facts read, every line kept. */
  facts?: Fact[];
  witnesses?: Witness[];
  items?: SourceItem[];
  diagnostics: Diagnostic[];
  /** Spans of witnesses, by witness id (every claim, witness and item carries a span). */
  witnessSpans?: Record<string, string>;
  /** Execution lines read beside the witnesses, so that tests that recorded nothing can be counted. */
  executions?: { test: string; outcome: LocalResult | "unknown"; span: string }[];
}

export interface Adapter {
  manifest: AdapterManifest;
  run(input: AdapterInput): AdapterOutput | Promise<AdapterOutput>;
}

/** A witness's outcome; a record that states none is unknown, never passed (section 3.2). */
export function outcomeOf(w: Witness): LocalResult | "unknown" {
  return w.execution.localResult ?? "unknown";
}

/** Digest of a witness without its informational recording time (recordedAt never enters a digest). */
export function witnessDigest(w: Witness): Digest {
  const { recordedAt: _ignored, ...rest } = w;
  return digestOf(canonicalJson(rest));
}

export interface WitnessProblem {
  line: number;
  message: string;
}

/** Parse an NDJSON witness file. Malformed lines are reported, never dropped silently. */
export function parseWitnesses(text: string): { witnesses: { w: Witness; line: number }[]; problems: WitnessProblem[] } {
  const witnesses: { w: Witness; line: number }[] = [];
  const problems: WitnessProblem[] = [];
  const ids = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (raw.trim() === "") return;
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch (err) {
      problems.push({ line, message: `not JSON: ${(err as Error).message}` });
      return;
    }
    const why = validateWitness(v);
    if (why !== undefined) {
      problems.push({ line, message: why });
      return;
    }
    const w = v as Witness;
    if (ids.has(w.id)) {
      problems.push({ line, message: `duplicate witness id ${w.id}` });
      return;
    }
    ids.add(w.id);
    witnesses.push({ w, line });
  });
  return { witnesses, problems };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function jsonValues(x: unknown): boolean {
  return isRecord(x) && Object.values(x).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v));
}

/** Structural validation of one record. Returns a reason, or undefined when the record is well formed. */
export function validateWitness(v: unknown): string | undefined {
  if (!isRecord(v)) return "not an object";
  if (v.schema !== "csh-witness/v1" && v.schema !== "csh-witness/v2") return "schema is not csh-witness/v1 or csh-witness/v2";
  const v2 = v.schema === "csh-witness/v2";
  if (typeof v.id !== "string" || v.id === "") return "missing id";
  if (typeof v.event !== "string") return "missing event";
  for (const k of ["args", "pre", "post"] as const) if (!jsonValues(v[k])) return `${k} must map keys to JSON scalars`;
  if ("result" in v && v.result !== null && !["string", "number", "boolean"].includes(typeof v.result)) return "result must be a JSON scalar";
  const ex = v.execution;
  if (!isRecord(ex) || !Array.isArray(ex.mocked)) return "malformed execution";
  if (!(v2 && ex.localResult === undefined) && !RESULTS.includes(ex.localResult as string)) return v2 ? "malformed execution" : "malformed execution: version 1 needs localResult";
  if (ex.test !== undefined && typeof ex.test !== "string") return "malformed execution";
  if ("cites" in v && (!v2 || !Array.isArray(v.cites) || !v.cites.every((c) => typeof c === "string" && c !== ""))) return v2 ? "cites must be a list of identifiers" : "cites needs csh-witness/v2";
  const s = v.subject;
  if (!isRecord(s) || typeof s.commit !== "string" || typeof s.environment !== "string") return "malformed subject";
  const t = v.tool;
  if (!isRecord(t) || typeof t.id !== "string" || typeof t.version !== "string") return "malformed tool";
  if (typeof v.recordedAt !== "string") return "missing recordedAt";
  return undefined;
}

const RESULTS = ["passed", "failed", "errored"];

/** Parse an NDJSON execution file. Malformed lines are reported, never dropped silently. */
export function parseExecutions(text: string): { executions: { e: Execution; line: number }[]; problems: WitnessProblem[] } {
  const executions: { e: Execution; line: number }[] = [];
  const problems: WitnessProblem[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (raw.trim() === "") return;
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch (err) {
      problems.push({ line, message: `not JSON: ${(err as Error).message}` });
      return;
    }
    if (!isRecord(v) || v.schema !== "csh-execution/v1" || typeof v.test !== "string" || v.test === "" || !RESULTS.includes(v.outcome as string)) {
      problems.push({ line, message: "not a csh-execution/v1 line with a test and an outcome of passed, failed or errored" });
      return;
    }
    executions.push({ e: v as unknown as Execution, line });
  });
  return { executions, problems };
}
