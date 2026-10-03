// Drafting a decision (Authority tab, section 3.4). The tool appends the line and stops;
// the person reads it, commits the ledger file alone, and signs. The tool never commits or signs.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Decision } from "./types.ts";

export function nextSeq(ledgerFile: string): number {
  if (!existsSync(ledgerFile)) return 1;
  let max = 0;
  for (const line of readFileSync(ledgerFile, "utf8").split("\n")) {
    try {
      const s = (JSON.parse(line) as { seq?: unknown }).seq;
      if (typeof s === "number" && s > max) max = s;
    } catch {
      // Not an entry; ignored here and reported by the reader.
    }
  }
  return max + 1;
}

/** One ledger line with keys in a fixed order, so that drafts are reproducible. */
export function formatDecision(d: Decision): string {
  const o: Record<string, unknown> = { schema: d.schema, seq: d.seq, kind: d.kind, fragment: d.fragment, digest: d.digest };
  if (d.cited !== undefined) o.cited = d.cited;
  o.rationale = d.rationale;
  o.actor = d.actor;
  o.selfApproved = d.selfApproved;
  if (d.waiver !== undefined) o.waiver = d.waiver;
  if (d.refers !== undefined) o.refers = d.refers;
  return JSON.stringify(o);
}

export function appendDecision(ledgerFile: string, d: Omit<Decision, "seq" | "schema">): Decision {
  if (d.rationale.trim() === "") throw new Error("a decision needs a rationale");
  const full: Decision = { schema: "csh-decision/v1", seq: nextSeq(ledgerFile), ...d };
  mkdirSync(dirname(ledgerFile), { recursive: true });
  appendFileSync(ledgerFile, `${formatDecision(full)}\n`);
  return full;
}
