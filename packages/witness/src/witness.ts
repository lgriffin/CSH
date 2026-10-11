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
  /**
   * What the item is, when an inventory adapter read it (Ingesting a codebase, stage 22): a requirement, a rule, a
   * scenario, a feature, a test file, a document or an issue. An item with a kind is traced through edges, not cited
   * by fragments, so it is never reported uncited.
   */
  kind?: ItemKind;
  /** Fields the source states beside the item, such as a requirement's status, by field name. */
  attrs?: Record<string, string>;
}

export type ItemKind = "requirement" | "rule" | "scenario" | "feature" | "test-file" | "document" | "issue";

/**
 * How one item refers to another, or to a file of the repository (stage 22). `implements`: a document says it
 * implements a requirement. `verified-by`: a requirement names the mechanism that verifies it. `exemplifies`: a
 * scenario sits under a rule. `cites`: a test names a requirement in its title. `mentions`: free text names an item; it
 * counts only when it resolves. `mentions-file`: text names a path. `mentions-symbol` (stage 24): text names a symbol
 * beside the one code path on its line, as "symbol:" path "#" name. `mentions-script`: text names `npm run` and a
 * script, as "script:" name.
 */
export type EdgeRel = "implements" | "verified-by" | "exemplifies" | "cites" | "mentions" | "mentions-file" | "mentions-symbol" | "mentions-script";

export interface ItemEdge {
  /** The item the edge starts from, in the same source. */
  from: string;
  rel: EdgeRel;
  /** An item identifier, bare or as Source/id, or "file:" and a path relative to the repository root. */
  to: string;
  span: string;
}

export interface AdapterManifest {
  id: string;
  version: string;
  ir: "csh-ir/v1";
  produces: ("claims" | "witnesses" | "items" | "edges" | "diagram" | "facts" | "results")[];
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
  /** Version 2 (Ingesting a codebase, stage 23) adds module, export and field facts; version 1 lines read unchanged. */
  schema: "csh-facts/v1" | "csh-facts/v2";
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

/** One source file of the code, by its path from the repository root (version 2). */
export interface ModuleFact extends FactBase {
  kind: "module";
  name: string;
}

/** A name a module exports: a declaration, a renamed or re-exported name, or "*" for `export * from` (version 2). */
export interface ExportFact extends FactBase {
  kind: "export";
  module: string;
  symbol: string;
  /** The module a re-export takes it from, when it is one. */
  from?: string;
  typeOnly: boolean;
}

/** One value of a manifest, such as package.json's engines.node, by its dotted path (version 2). */
export interface FieldFact extends FactBase {
  kind: "field";
  file: string;
  path: string;
  value: string;
}

/**
 * A name a module declares at its top level, exported or not (version 2, stage 24): what it declares, the class it
 * extends as written, and a constant's literal value.
 */
export interface DeclareFact extends FactBase {
  kind: "declare";
  module: string;
  symbol: string;
  declares: "class" | "function" | "const" | "let" | "var" | "interface" | "type" | "enum" | "namespace";
  /** The base a class extends, as written: a name, or a dotted name. */
  base?: string;
  /** A const's value, when it is a string, number or boolean literal. */
  value?: string;
}

/**
 * The fact format (csh-facts/v1 and v2), evidence beside the witness format; a fact never carries authority. In
 * version 2 a dependency's ends may be modules, by path, as well as packages.
 */
export type Fact = PackageFact | DependencyFact | SkippedFact | ModuleFact | ExportFact | FieldFact | DeclareFact;

export interface AdapterOutput {
  claims?: ClaimSet;
  /** An Architecture source: the diagram's elements and relations. */
  diagram?: Diagram;
  /** A Facts source: the facts read, every line kept. */
  facts?: Fact[];
  witnesses?: Witness[];
  items?: SourceItem[];
  /** References between items, and from items to files (stage 22). */
  edges?: ItemEdge[];
  diagnostics: Diagnostic[];
  /** Spans of witnesses, by witness id (every claim, witness and item carries a span). */
  witnessSpans?: Record<string, string>;
  /** Execution lines read beside the witnesses, so that tests that recorded nothing can be counted. */
  executions?: { test: string; outcome: LocalResult | "unknown"; span: string }[];
  /**
   * A test-file source's results (Ingesting a codebase, stage 26): one per finished test, with the test file it ran
   * in, as an item id of the source, and the identifiers its full name cites. The test's name is never carried.
   */
  results?: TestResult[];
}

/** What a test runner says of one test: passed, failed, errored (its file could not run), or skipped (never run). */
export type TestOutcome = LocalResult | "skipped";

/** One finished test of a test-file source, joined to its file and to what its name cites. */
export interface TestResult {
  file: string;
  outcome: TestOutcome;
  cites: string[];
  /** Where in the results file the test is reported. */
  span: string;
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

/** One test as a runner's results report it: the file it ran in, as the runner wrote it, and its full name. */
export interface RunnerResult {
  file: string;
  name: string;
  outcome: TestOutcome;
  /** The line of an execution file, or the test's position in a JSON report as `testResults[i].assertionResults[j]`. */
  at: string;
}

const RUNNER_STATUS: Record<string, TestOutcome> = { passed: "passed", failed: "failed", pending: "skipped", skipped: "skipped", todo: "skipped", disabled: "skipped", focused: "passed" };

/**
 * A test runner's results (Ingesting a codebase, stage 26): the JSON report Jest's --json and Vitest's json reporter
 * write, or csh-execution/v1 lines. A file of a JSON report that failed to run and reports no test is one errored
 * result for that file, with an empty name. Malformed input is reported, never dropped silently.
 */
export function parseTestResults(text: string): { results: RunnerResult[]; problems: WitnessProblem[] } {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{") || !/"testResults"\s*:/.test(trimmed)) {
    const parsed = parseExecutions(text);
    return {
      results: parsed.executions.map(({ e, line }) => {
        const cut = e.test.indexOf("::");
        return { file: cut < 0 ? "" : e.test.slice(0, cut), name: cut < 0 ? e.test : e.test.slice(cut + 2), outcome: e.outcome, at: String(line) };
      }),
      problems: parsed.problems,
    };
  }
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (err) {
    return { results: [], problems: [{ line: 1, message: `not JSON: ${(err as Error).message}` }] };
  }
  const files = isRecord(v) ? v.testResults : undefined;
  if (!Array.isArray(files)) return { results: [], problems: [{ line: 1, message: "a JSON report needs a testResults array" }] };
  const results: RunnerResult[] = [];
  const problems: WitnessProblem[] = [];
  files.forEach((f: unknown, i) => {
    if (!isRecord(f) || typeof f.name !== "string") {
      problems.push({ line: 1, message: `testResults[${i}] names no file` });
      return;
    }
    const file = f.name;
    const tests = Array.isArray(f.assertionResults) ? f.assertionResults : [];
    if (tests.length === 0 && f.status === "failed") results.push({ file, name: "", outcome: "errored", at: `testResults[${i}]` });
    tests.forEach((t: unknown, j) => {
      const at = `testResults[${i}].assertionResults[${j}]`;
      const outcome = isRecord(t) && typeof t.status === "string" ? RUNNER_STATUS[t.status] : undefined;
      if (!isRecord(t) || outcome === undefined) {
        problems.push({ line: 1, message: `${at} has no status a runner reports` });
        return;
      }
      const titles = [...(Array.isArray(t.ancestorTitles) ? t.ancestorTitles.filter((x): x is string => typeof x === "string") : []), ...(typeof t.title === "string" ? [t.title] : [])];
      const full = t.fullName;
      const name = typeof full === "string" && full !== "" ? full : titles.join(" ");
      results.push({ file, name, outcome, at });
    });
  });
  return { results, problems };
}
