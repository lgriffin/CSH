// The fact format (csh-facts/v1): its reader and writer (Next layers, section 4.2). A fact is evidence, like a witness:
// it records the commit it was taken at, goes stale when the code changes, and never carries authority.
import { DECLARATION_KINDS, type Fact } from "@csh/witness";

export const FACTS_SCHEMA = "csh-facts/v1";
/** Version 2 (Ingesting a codebase, stage 23): module, export and field facts beside version 1's kinds. */
export const FACTS_SCHEMA_V2 = "csh-facts/v2";
export const FACTS_FILE = "reports/facts.ndjson";

export interface FactProblem {
  line: number;
  message: string;
}

const str = (x: unknown): x is string => typeof x === "string" && x !== "";

/** Why a value is not a fact, or undefined when it is one. */
export function validateFact(v: unknown): string | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return "not an object";
  const o = v as Record<string, unknown>;
  if (o.schema !== FACTS_SCHEMA && o.schema !== FACTS_SCHEMA_V2) return `schema is ${JSON.stringify(o.schema)}, not ${FACTS_SCHEMA} or ${FACTS_SCHEMA_V2}`;
  if (!str(o.at)) return "no at";
  const subject = o.subject as { commit?: unknown } | undefined;
  if (typeof subject !== "object" || subject === null || !str(subject.commit)) return "no subject.commit";
  const tool = o.tool as { id?: unknown; version?: unknown } | undefined;
  if (typeof tool !== "object" || tool === null || !str(tool.id) || !str(tool.version)) return "no tool id and version";
  if (o.kind === "package") return str(o.name) ? undefined : "a package fact has no name";
  if (o.kind === "depends") {
    if (!str(o.from) || !str(o.to)) return "a dependency fact needs from and to";
    if (o.via !== "import" && o.via !== "manifest") return `via is ${JSON.stringify(o.via)}, not import or manifest`;
    if (typeof o.typeOnly !== "boolean") return "typeOnly is not a boolean";
    return undefined;
  }
  if (o.kind === "skipped") return str(o.from) && str(o.reason) ? undefined : "a skipped fact needs from and reason";
  if (o.kind === "module" || o.kind === "export" || o.kind === "field" || o.kind === "declare") {
    if (o.schema !== FACTS_SCHEMA_V2) return `a ${o.kind} fact needs ${FACTS_SCHEMA_V2}`;
    if (o.kind === "module") return str(o.name) && (o.language === undefined || str(o.language)) ? undefined : "a module fact has no name";
    if (o.kind === "export") return str(o.module) && str(o.symbol) && typeof o.typeOnly === "boolean" && (o.from === undefined || str(o.from)) ? undefined : "an export fact needs module, symbol and typeOnly";
    if (o.kind === "declare") {
      return str(o.module) && str(o.symbol) && (DECLARATION_KINDS as readonly string[]).includes(o.declares as string) && (o.base === undefined || str(o.base)) && (o.value === undefined || typeof o.value === "string") ? undefined : "a declare fact needs module, symbol and what it declares";
    }
    return str(o.file) && str(o.path) && typeof o.value === "string" ? undefined : "a field fact needs file, path and value";
  }
  return `unknown kind ${JSON.stringify(o.kind)}`;
}

/** Parse a facts file. A malformed line is reported, never dropped silently. */
export function parseFacts(text: string): { facts: { fact: Fact; line: number }[]; problems: FactProblem[] } {
  const facts: { fact: Fact; line: number }[] = [];
  const problems: FactProblem[] = [];
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
    const why = validateFact(v);
    if (why !== undefined) problems.push({ line, message: why });
    else facts.push({ fact: v as Fact, line });
  });
  return { facts, problems };
}

/** One fact per line, in the order given. */
export function formatFacts(facts: Fact[]): string {
  return facts.map((f) => `${JSON.stringify(f)}\n`).join("");
}
