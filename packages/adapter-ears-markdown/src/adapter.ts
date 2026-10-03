// Reference adapter B: structured requirements in EARS form, in Markdown (Evidence tab, section 6).
// It never generates predicates: each identified sentence becomes a citable item.
import { digestOf, type ClaimSet } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, Diagnostic, SourceItem } from "@csh/witness";

export const manifest = {
  id: "csh.adapter.ears-markdown",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["items"],
  inputKinds: ["Requirements"],
} as const;

export type EarsPattern = "ubiquitous" | "event-driven" | "state-driven" | "unwanted-behaviour" | "complex" | "optional-feature";

/** Recognise the EARS pattern of a sentence by its keywords (Language reference, section 5). */
export function classify(text: string): EarsPattern | undefined {
  const t = text.trim();
  if (!/\bSHALL\b/i.test(t)) return undefined;
  if (/^WHERE\b/i.test(t)) return "optional-feature";
  if (/^WHILE\b/i.test(t)) return /\bWHEN\b/i.test(t) || /\bIF\b/i.test(t) ? "complex" : "state-driven";
  if (/^IF\b/i.test(t) && /\bTHEN\b/i.test(t)) return "unwanted-behaviour";
  if (/^WHEN\b/i.test(t)) return /\bIF\b.*\bTHEN\b/i.test(t) ? "complex" : "event-driven";
  if (/^THE\b/i.test(t)) return "ubiquitous";
  return undefined;
}

/** Which EARS clauses a pattern carries, for the shape check. */
export function clausesOf(pattern: string | undefined): { while: boolean; ifClause: boolean } {
  return {
    while: pattern === "state-driven" || pattern === "complex",
    ifClause: pattern === "unwanted-behaviour",
  };
}

export const DEFAULT_ID_PATTERN = "[A-Z][A-Z0-9]*-[0-9]+";

export function run(input: AdapterInput): AdapterOutput {
  const idPattern = input.config?.requirementIdPattern ?? DEFAULT_ID_PATTERN;
  const tableRow = new RegExp(`^\\|\\s*(${idPattern})\\s*\\|\\s*(.*?)\\s*\\|?\\s*$`);
  const listItem = new RegExp(`^(?:[-*+]|\\d+[.)])\\s+(?:\\*\\*)?(${idPattern})(?:\\*\\*)?[:.]?\\s+(.*)$`);
  const bare = new RegExp(`^(${idPattern})[:.]?\\s+(.*)$`);
  const items: SourceItem[] = [];
  const diagnostics: Diagnostic[] = [];
  const claims: ClaimSet = { source: input.source.name, assumptions: [], obligations: [], examples: [], unliftable: [] };
  const seen = new Map<string, string>();
  for (const file of [...input.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const lines = new TextDecoder().decode(file.bytes).split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = raw.trim();
      const m = tableRow.exec(line) ?? listItem.exec(line) ?? bare.exec(line);
      if (m === null) return;
      const id = m[1]!;
      const text = m[2]!.replace(/\s*\|\s*$/, "").trim();
      const span = `${file.path}:${i + 1}`;
      if (seen.has(id)) {
        diagnostics.push({ code: "duplicate-id", severity: "error", message: `${id} is defined at ${seen.get(id)} and again here`, span });
        return;
      }
      seen.set(id, span);
      const pattern = classify(text);
      const item: SourceItem = { id, text, span, textDigest: digestOf(text) };
      if (pattern !== undefined) item.pattern = pattern;
      else {
        item.pattern = "none";
        diagnostics.push({ code: "no-pattern", severity: "warning", message: `${id} matches no EARS pattern`, span });
      }
      items.push(item);
      if (pattern === "optional-feature") claims.unliftable.push({ span, reason: "feature-scope", text });
    });
  }
  const out: AdapterOutput = { items, diagnostics };
  if (claims.unliftable.length > 0) out.claims = claims;
  return out;
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
