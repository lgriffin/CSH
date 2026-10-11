// Proposed claims (Ingesting a codebase, stage 24): structural claims kept beside the manifest in csh/claims.json, so
// that an agent can propose one without editing the specification. Each joins an intent of the emitted model as an
// architecture obligation, candidate like any other fragment: a proposal is never a decision, and whoever commits the
// file is its author.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Claim, compareCodePoints, isArchRule, type Module } from "@csh/kernel";
import type { ComponentProblem } from "./manifest.ts";

export const CLAIMS_PATH = "csh/claims.json";
export const CLAIMS_SCHEMA = "csh-claims/v1";

export interface ProposedClaim {
  /** The obligation's name inside its intent. */
  name: string;
  /** The intent of the specification the claim joins. */
  intent: string;
  claim: Claim;
  cites?: { source: string; id: string }[];
  /** Why the proposer reads the prose this way. */
  why?: string;
}

export interface ClaimsFile {
  schema: typeof CLAIMS_SCHEMA;
  claims: ProposedClaim[];
}

const NAME = /^[A-Z][A-Za-z0-9]*$/;

/** What is wrong with one proposed claim, or undefined. */
export function claimProblem(c: unknown): string | undefined {
  if (typeof c !== "object" || c === null) return "a proposed claim is an object";
  const o = c as Record<string, unknown>;
  if (typeof o.name !== "string" || !NAME.test(o.name)) return "name must start with a capital letter and hold only letters and digits";
  if (typeof o.intent !== "string" || o.intent === "") return `${o.name}: intent names the intent the claim joins`;
  if (!isArchRule(o.claim) || (o.claim as { k: string }).k !== "claim") return `${o.name}: claim is not a structural claim`;
  const cites = o.cites;
  if (cites !== undefined && !(Array.isArray(cites) && cites.every((x) => typeof x === "object" && x !== null && typeof (x as Record<string, unknown>).source === "string" && typeof (x as Record<string, unknown>).id === "string"))) return `${o.name}: cites are { source, id }`;
  if (o.why !== undefined && typeof o.why !== "string") return `${o.name}: why is text`;
  const extra = Object.keys(o).filter((k) => !["name", "intent", "claim", "cites", "why"].includes(k));
  return extra.length > 0 ? `${o.name}: unknown field ${extra.join(", ")}` : undefined;
}

/** The proposed claims of a component root, with the problems of a malformed file; none when there is no file. */
export function readClaims(root: string): { claims: ProposedClaim[]; problems: ComponentProblem[] } {
  const path = join(root, CLAIMS_PATH);
  if (!existsSync(path)) return { claims: [], problems: [] };
  let v: unknown;
  try {
    v = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return { claims: [], problems: [{ code: "claims-malformed", detail: `${CLAIMS_PATH}: ${(err as Error).message}` }] };
  }
  const o = v as Partial<ClaimsFile>;
  if (o.schema !== CLAIMS_SCHEMA || !Array.isArray(o.claims)) return { claims: [], problems: [{ code: "claims-malformed", detail: `${CLAIMS_PATH} needs schema ${CLAIMS_SCHEMA} and a claims list` }] };
  const problems = o.claims.flatMap((c) => {
    const p = claimProblem(c);
    return p !== undefined ? [{ code: "claims-malformed", detail: `${CLAIMS_PATH}: ${p}` }] : [];
  });
  return problems.length > 0 ? { claims: [], problems } : { claims: o.claims, problems: [] };
}

/** The model with each proposed claim in its intent, or the problems: an unknown intent, or a name already taken. */
export function withProposedClaims(m: Module, claims: ProposedClaim[]): { module: Module; errors: ComponentProblem[] } {
  if (claims.length === 0) return { module: m, errors: [] };
  const errors: ComponentProblem[] = [];
  const intents = m.intents.map((i) => ({ ...i, obligations: [...i.obligations] }));
  for (const c of [...claims].sort((a, b) => compareCodePoints(`${a.intent}/${a.name}`, `${b.intent}/${b.name}`))) {
    const intent = intents.find((i) => i.name === c.intent);
    if (intent === undefined) {
      errors.push({ code: "claims-unknown-intent", detail: `${CLAIMS_PATH}: ${c.name} joins ${c.intent}, which the specification does not declare` });
      continue;
    }
    if ([...intent.obligations, ...intent.examples, ...intent.assumptions].some((o) => o.name === c.name)) {
      errors.push({ code: "claims-duplicate", detail: `${CLAIMS_PATH}: ${c.intent} already holds ${c.name}` });
      continue;
    }
    intent.obligations.push({ kind: "architecture", name: c.name, native: c.claim, ...(c.cites !== undefined ? { cites: c.cites } : {}) });
  }
  return { module: { ...m, intents }, errors };
}

/** Add one proposed claim to csh/claims.json, refusing a malformed one or a name the file already holds. */
export function proposeClaim(root: string, c: ProposedClaim): { ok: true; path: string } | { ok: false; problem: string } {
  const problem = claimProblem(c);
  if (problem !== undefined) return { ok: false, problem };
  const current = readClaims(root);
  if (current.problems.length > 0) return { ok: false, problem: current.problems.map((p) => p.detail).join("; ") };
  if (current.claims.some((x) => x.intent === c.intent && x.name === c.name)) return { ok: false, problem: `${CLAIMS_PATH} already proposes ${c.intent}/${c.name}` };
  const file: ClaimsFile = { schema: CLAIMS_SCHEMA, claims: [...current.claims, c] };
  writeFileSync(join(root, CLAIMS_PATH), `${JSON.stringify(file, null, 2)}\n`);
  return { ok: true, path: CLAIMS_PATH };
}
