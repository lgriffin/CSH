// The witness format (csh-witness/v1) and the adapter contract (Evidence tab, sections 2 and 4).
import { canonicalJson, digestOf, type ClaimSet, type Digest, type Binding, type Source, type Vocabulary } from "@csh/kernel";

export type Json = string | number | boolean | null;

export interface Witness {
  schema: "csh-witness/v1";
  id: string;
  event: string;
  args: Record<string, Json>;
  pre: Record<string, Json>;
  post: Record<string, Json>;
  result?: Json;
  execution: {
    test?: string;
    localResult: "passed" | "failed" | "errored";
    mocked: string[];
  };
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
  produces: ("claims" | "witnesses" | "items")[];
  inputKinds: string[];
}

export interface AdapterInput {
  source: Source;
  vocabulary: Vocabulary;
  bindings: (Binding & { authority: string })[];
  files: { path: string; digest: string; bytes: Uint8Array }[];
  /** Adapter-specific settings, such as the identifier pattern of adapter B. */
  config?: Record<string, string>;
}

export interface Diagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  span?: string;
}

export interface AdapterOutput {
  claims?: ClaimSet;
  witnesses?: Witness[];
  items?: SourceItem[];
  diagnostics: Diagnostic[];
  /** Spans of witnesses, by witness id (every claim, witness and item carries a span). */
  witnessSpans?: Record<string, string>;
}

export interface Adapter {
  manifest: AdapterManifest;
  run(input: AdapterInput): AdapterOutput;
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
  if (v.schema !== "csh-witness/v1") return "schema is not csh-witness/v1";
  if (typeof v.id !== "string" || v.id === "") return "missing id";
  if (typeof v.event !== "string") return "missing event";
  for (const k of ["args", "pre", "post"] as const) if (!jsonValues(v[k])) return `${k} must map keys to JSON scalars`;
  if ("result" in v && v.result !== null && !["string", "number", "boolean"].includes(typeof v.result)) return "result must be a JSON scalar";
  const ex = v.execution;
  if (!isRecord(ex) || !["passed", "failed", "errored"].includes(ex.localResult as string) || !Array.isArray(ex.mocked)) return "malformed execution";
  const s = v.subject;
  if (!isRecord(s) || typeof s.commit !== "string" || typeof s.environment !== "string") return "malformed subject";
  const t = v.tool;
  if (!isRecord(t) || typeof t.id !== "string" || typeof t.version !== "string") return "malformed tool";
  if (typeof v.recordedAt !== "string") return "missing recordedAt";
  return undefined;
}
