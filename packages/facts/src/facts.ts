// The fact format (csh-facts/v1): its reader and writer (Next layers, section 4.2). A fact is evidence, like a witness:
// it records the commit it was taken at, goes stale when the code changes, and never carries authority.
import type { Fact } from "@csh/witness";

export const FACTS_SCHEMA = "csh-facts/v1";
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
  if (o.schema !== FACTS_SCHEMA) return `schema is ${JSON.stringify(o.schema)}, not ${FACTS_SCHEMA}`;
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
