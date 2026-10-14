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

/**
 * The phrase by which a sentence claims that something checks it (Analyse, danger and grain, Q-52): "tested", "covered
 * by tests", "enforced", "guaranteed", "verified", "checked by". It is cited, never translated: the claim is the words, and
 * whether a mechanism stands behind them is the Assertion Ladder's to say. A modal alone ("cannot", "must not") states
 * the rule and claims nothing more (A-192).
 */
const CLAIM = /\b(?:(?:unit[- ])?tested|covered\s+by\s+(?:the\s+)?(?:unit\s+)?tests?|enforced|guaranteed|guarantees?|verified|checked\s+(?:by|in|at)|asserted\s+by)\b/i;

export function claimOf(text: string): string | undefined {
  return CLAIM.exec(text)?.[0];
}

/** Which EARS clauses a pattern carries, for the shape check. */
export function clausesOf(pattern: string | undefined): { while: boolean; ifClause: boolean } {
  return {
    while: pattern === "state-driven" || pattern === "complex",
    ifClause: pattern === "unwanted-behaviour",
  };
}

export const DEFAULT_ID_PATTERN = "[A-Z][A-Z0-9]*-[0-9]+";

/** The cells of a table row, without the outer pipes. */
function cellsOf(row: string): string[] {
  return row.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
}

/**
 * The requirement sentence of a table row: the first cell after the identifier that says shall (tables often carry a
 * pattern or a status column between the identifier and the sentence), else the first cell after it.
 */
function sentenceOf(row: string): string {
  const cells = cellsOf(row).slice(1);
  return cells.find((c) => /\bSHALL\b/i.test(c)) ?? cells[0] ?? "";
}

export function run(input: AdapterInput): AdapterOutput {
  const idPattern = input.config?.idPattern ?? input.config?.requirementIdPattern ?? DEFAULT_ID_PATTERN;
  const tableRow = new RegExp(`^\\|\\s*(${idPattern})\\s*\\|`);
  const listItem = new RegExp(`^(?:[-*+]|\\d+[.)])\\s+(?:\\*\\*)?(${idPattern})(?:\\*\\*)?[:.]?\\s+(.*)$`);
  const bare = new RegExp(`^(${idPattern})[:.]?\\s+(.*)$`);
  const items: SourceItem[] = [];
  const diagnostics: Diagnostic[] = [];
  const claims: ClaimSet = { source: input.source.name, assumptions: [], obligations: [], examples: [], unliftable: [] };
  const seen = new Map<string, string>();
  for (const file of [...input.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const lines = new TextDecoder().decode(file.bytes).split(/\r?\n/);
    const before = items.length + diagnostics.filter((d) => d.code === "duplicate-id").length;
    // Every line that could define an identifier, with how firm a definition it is: a table row, then a list item, then a
    // line of its own. An identifier a table row defines is only mentioned by the list items that name it ("- **X-01 is
    // new**: ..."), so within one file the firmest kind wins, and only two of that kind are a duplicate.
    const found: { id: string; text: string; span: string; rank: number }[] = [];
    lines.forEach((raw, i) => {
      const line = raw.trim();
      const span = `${file.path}:${i + 1}`;
      const t = tableRow.exec(line);
      if (t !== null) return void found.push({ id: t[1]!, text: sentenceOf(line), span, rank: 0 });
      const m = listItem.exec(line) ?? bare.exec(line);
      if (m !== null) found.push({ id: m[1]!, text: m[2]!.trim(), span, rank: listItem.test(line) ? 1 : 2 });
    });
    const best = new Map<string, number>();
    for (const f of found) best.set(f.id, Math.min(best.get(f.id) ?? 9, f.rank));
    for (const { id, text, span, rank } of found) {
      if (rank !== best.get(id)) continue;
      if (seen.has(id)) {
        diagnostics.push({ code: "duplicate-id", severity: "error", message: `${id} is defined at ${seen.get(id)} and again here`, span });
        continue;
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
    }
    // A file read whole that yields nothing is said, never left to look like a source with no requirements (P4).
    if (items.length + diagnostics.filter((d) => d.code === "duplicate-id").length === before) {
      diagnostics.push({ code: "no-items", severity: "warning", message: `none of the ${lines.length} lines of ${file.path} carries an identifier matching ${idPattern} as a table row, a list item or a line of its own`, span: file.path });
    }
  }
  const out: AdapterOutput = { items, diagnostics };
  if (claims.unliftable.length > 0) out.claims = claims;
  return out;
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
