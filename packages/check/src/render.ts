// The human-readable report, generated from the report JSON and nothing else
// (Joint evaluation, section 6). Order: cross-source conflicts, other conflicts, failed
// preservation, unknowns, the gap view. Counts come last, and there is never a score.
import type { Assessment, Finding, Report } from "./types.ts";

const CONFLICTS = new Set(["state-conflict", "joint-conflict", "example-conflict", "arch-conflict", "claim-conflict", "fact-conflict", "vacuous"]);
const PRESERVATION = new Set(["not-preserved", "not-met"]);

/** The readings of a divergence (Anchor, harnesses and A3, section 6.1): one more than a conflict has. */
export const DIVERGENCE_READINGS = [
  "Four readings, and the harness chooses none:",
  "  1. One example is wrong.",
  "  2. An unstated input separates them.",
  "  3. The intent is undecided, and a person must decide it.",
  "  4. The event may answer the same input in more than one way.",
];

const READINGS = [
  "Three readings, and the harness chooses none:",
  "  1. A member is wrong.",
  "  2. A context is missing (an assumption that would separate the cases).",
  "  3. The intent is undecided, and a person must decide it.",
];

/**
 * The line a claim was read from, given the span the claim names and the values it states (From real runs, stage 43):
 * the line at the span, or, when the span opens a block (a table, a list) and the values are on a later line of it,
 * that line. `at` is where the returned text is.
 */
export type SentenceAt = (span: string, values?: string[]) => { at: string; text: string } | undefined;

/** The numbers and versions a claim's description states: 5, 22.12, 1.35.0. */
const valuesIn = (text: string): string[] => [...new Set([...text.matchAll(/\d+(?:\.\d+)*/g)].map((m) => m[0]))];

/**
 * Where a claim finding's sentences are: each `path:line` its reason opens a clause with, and the values the claim at
 * that span states (stage 46), so that the sentence shown is the one holding them.
 */
export const claimSpans = (f: Finding): { span: string; values: string[] }[] => {
  if (f.kind !== "fact-conflict" && f.kind !== "claim-conflict") return [];
  const reason = f.reason ?? "";
  const spans = [...reason.matchAll(/(?:^| and )([^\s:]+:\d+): /g)].map((m) => m[1]!);
  const said =
    f.kind === "fact-conflict"
      ? [/ says (.*?)(?:; |$)/.exec(reason)?.[1] ?? ""]
      : (() => {
          const m = /one says (.*), the other (.*)$/.exec(reason);
          return m === null ? [] : [m[1]!, m[2]!];
        })();
  return spans.map((span, i) => ({ span, values: valuesIn(said[i] ?? "") }));
};

/**
 * The index of the line a claim's values are on: `from`, or, when `from` opens a block (a table, a list) and the values
 * are on a later line of it, that line, before the block ends at a blank line (stage 46). A value is matched whole: 5
 * is not found in 15 or in 1.5.
 */
export function lineHolding(lines: readonly string[], from: number, values: readonly string[]): number {
  if (values.length === 0) return from;
  const res = values.map((v) => new RegExp(`(?<![\\d.])${v.replace(/\./g, "\\.")}(?!\\d|\\.\\d)`));
  const holds = (l: string) => res.some((r) => r.test(l));
  if (holds(lines[from] ?? "")) return from;
  for (let i = from + 1; i < Math.min(lines.length, from + 40) && lines[i]!.trim() !== ""; i++) if (holds(lines[i]!)) return i;
  return from;
}

function finding(f: Finding, sentenceAt?: SentenceAt): string[] {
  const lines = [`[${f.kind}] ${f.id}${f.crossSource ? "  (cross-source)" : ""}  from ${f.query}`];
  // A claim reads as the sentence that made it, beside the fact that decides it.
  for (const { span, values } of sentenceAt !== undefined ? claimSpans(f) : []) {
    const said = sentenceAt!(span, values);
    if (said !== undefined) lines.push(`  ${said.at} says: "${said.text}"`);
  }
  for (const m of f.members) lines.push(`  - ${m.fragment}  source ${m.source}, ${m.authority}`);
  if (f.context.length > 0) lines.push(`  context: ${f.context.join(", ")}`);
  if (f.collisionTerms.length > 0) lines.push(`  collision terms: ${f.collisionTerms.join(", ")}`);
  if (f.inputs !== undefined) lines.push(`  inputs: ${f.inputs}`);
  if (f.witness !== undefined) {
    const label = f.kind === "joint-conflict" ? "input with no valid outcome" : f.kind === "example-divergence" ? "a shared input" : "counterexample";
    lines.push(`  ${label}: ${Object.entries(f.witness).map(([k, v]) => `${k} = ${v}`).join(", ")}`);
  }
  if (f.reason !== undefined) lines.push(`  reason: ${f.reason}`);
  if (f.incomplete === true) lines.push("  the list of minimal sets is incomplete (limit of 16 reached)");
  if (CONFLICTS.has(f.kind) && f.kind !== "vacuous") lines.push(...READINGS.map((l) => `  ${l}`));
  if (f.kind === "example-divergence") lines.push(...DIVERGENCE_READINGS.map((l) => `  ${l}`));
  return lines;
}

function assessment(a: Assessment): string {
  const flags = [a.authority, a.selfApproved ? "self-approved" : "", a.needsReview ? "needs-review" : "", a.authorityReason ?? "", a.authoredBy !== undefined ? `authored by ${a.authoredBy}` : ""].filter((x) => x !== "").join(", ");
  const scope = a.scope !== undefined ? ` (${a.scope})` : "";
  const reasons = a.reasons.length > 0 ? `  ${a.reasons.join("; ")}` : "";
  return `  ${a.verdict}${scope}  ${a.fragment}  [${flags}; evidence ${a.applicability}]${reasons}`;
}

const RESULT_PROBLEMS = new Set(["malformed-results", "no-results"]);

export function renderReport(r: Report, sentenceAt?: SentenceAt): string {
  const out: string[] = [`CSH report for ${r.moduleDigest}`, `tool ${r.tool.version}, solver ${r.tool.solver}, budget ${r.tool.budgetMs} ms${r.snapshot !== undefined ? `, commit ${r.snapshot.commit}, ledger head ${r.snapshot.ledgerHead}` : ""}`, ""];
  const section = (title: string, fs: Finding[]) => {
    if (fs.length === 0) return;
    out.push(`== ${title}`, "");
    for (const f of fs) out.push(...finding(f, sentenceAt), "");
  };
  section("Cross-source conflicts", r.findings.filter((f) => CONFLICTS.has(f.kind) && f.crossSource));
  section("Other conflicts", r.findings.filter((f) => CONFLICTS.has(f.kind) && !f.crossSource));
  section("Divergences between examples", r.findings.filter((f) => f.kind === "example-divergence"));
  section("Failed preservation", r.findings.filter((f) => PRESERVATION.has(f.kind)));
  section("Unknown", r.findings.filter((f) => f.kind === "unknown"));
  if (r.findings.length === 0) out.push("No findings.", "");
  if (r.notComparable.length > 0) {
    out.push("== Not comparable", "");
    for (const n of r.notComparable) out.push(`  ${n.fragment}  (${n.source}): ${n.reason}`);
    out.push("");
  }
  out.push(...renderGaps(r));
  if (r.assessments !== undefined && r.assessments.length > 0) {
    out.push("== Obligations", "");
    for (const a of r.assessments) out.push(assessment(a));
    out.push("");
  }
  if (r.errors.length > 0) {
    out.push("== Errors and warnings", "");
    for (const e of r.errors) out.push(`  ${e.severity} ${e.code}: ${e.detail}`);
    out.push("");
  }
  // Test results (stage 26): what could not be read from a results file is shown, not only stored.
  const resultProblems = r.diagnostics.filter((d) => RESULT_PROBLEMS.has(d.code));
  if (resultProblems.length > 0) {
    out.push("== Test results", "");
    for (const d of resultProblems) out.push(`  ${d.severity} ${d.code} (${d.source}${d.span !== undefined ? ` ${d.span}` : ""}): ${d.message}`);
    out.push("");
  }
  if (r.ledger !== undefined && r.ledger.invalid.length > 0) {
    out.push("== Ignored ledger entries", "");
    for (const e of r.ledger.invalid) out.push(`  seq ${e.seq}: ${e.reason}${e.commit !== undefined ? ` (commit ${e.commit.slice(0, 12)})` : ""}`);
    out.push("");
  }
  const count = (k: string) => r.findings.filter((f) => f.kind === k).length;
  out.push("== Counts", "");
  out.push(`  findings ${r.findings.length}: ${["state-conflict", "joint-conflict", "example-conflict", "arch-conflict", "claim-conflict", "fact-conflict", "example-divergence", "vacuous", "not-preserved", "not-met", "unknown"].map((k) => `${k} ${count(k)}`).join(", ")}`);
  out.push(`  gaps ${r.gapView.gaps.length}; not comparable ${r.notComparable.length}; unliftable ${r.unliftable.length}`);
  if (r.outcomes !== undefined) {
    const files = new Set(r.items.filter((i) => i.kind === "test-file").map((i) => `${i.source}/${i.id}`));
    const rows = r.outcomes.filter((o) => files.has(o.item));
    const sum = (k: "tests" | "passed" | "failed" | "errored" | "skipped") => rows.reduce((n, o) => n + o[k], 0);
    out.push(`  tests ${sum("tests")} in ${rows.length} files: passed ${sum("passed")}, failed ${sum("failed")}, errored ${sum("errored")}, skipped ${sum("skipped")}; cited items ${r.outcomes.length - rows.length}`);
  }
  if (r.verifiedBy !== undefined) {
    const passing = r.verifiedBy.filter((v) => v.unreported === 0 && v.failed + v.errored === 0 && v.passed > 0).length;
    const unreported = r.verifiedBy.filter((v) => v.unreported > 0).length;
    out.push(`  verified by test files ${r.verifiedBy.length}: every named file passed ${passing}, some named file reported no result ${unreported}`);
  }
  if (r.assessments !== undefined) {
    const v = (x: string) => r.assessments!.filter((a) => a.verdict === x).length;
    out.push(`  obligations ${r.assessments.length}: conflicting ${v("conflicting")}, violated ${v("violated")}, satisfied ${v("satisfied")}, unknown ${v("unknown")}`);
  }
  return `${out.join("\n")}\n`;
}

export function renderGaps(r: Report): string[] {
  const out: string[] = ["== Gap view", ""];
  const cols = r.gapView.sources;
  const width = Math.max(7, ...r.gapView.rows.map((x) => x.subject.length));
  const cw = Math.max(11, ...cols.map((c) => c.length));
  out.push(`  ${"subject".padEnd(width)}  ${cols.map((c) => c.padEnd(cw)).join(" ")}`);
  for (const row of r.gapView.rows) out.push(`  ${row.subject.padEnd(width)}  ${cols.map((c) => (row.cells[c] ?? "silent").padEnd(cw)).join(" ")}`);
  out.push("");
  if (r.gapView.gaps.length > 0) {
    out.push("  Derived gaps (a gap is not a failure):");
    for (const g of r.gapView.gaps) out.push(`  - ${g.kind}  ${g.subject}${g.detail !== undefined ? `: ${g.detail}` : ""}`);
    out.push("");
  }
  return out;
}
