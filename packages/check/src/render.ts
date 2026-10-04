// The human-readable report, generated from the report JSON and nothing else
// (Joint evaluation, section 6). Order: cross-source conflicts, other conflicts, failed
// preservation, unknowns, the gap view. Counts come last, and there is never a score.
import type { Assessment, Finding, Report } from "./types.ts";

const CONFLICTS = new Set(["state-conflict", "joint-conflict", "example-conflict", "arch-conflict", "vacuous"]);
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

function finding(f: Finding): string[] {
  const lines = [`[${f.kind}] ${f.id}${f.crossSource ? "  (cross-source)" : ""}  from ${f.query}`];
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
  const flags = [a.authority, a.selfApproved ? "self-approved" : "", a.needsReview ? "needs-review" : "", a.authorityReason ?? ""].filter((x) => x !== "").join(", ");
  const scope = a.scope !== undefined ? ` (${a.scope})` : "";
  const reasons = a.reasons.length > 0 ? `  ${a.reasons.join("; ")}` : "";
  return `  ${a.verdict}${scope}  ${a.fragment}  [${flags}; evidence ${a.applicability}]${reasons}`;
}

export function renderReport(r: Report): string {
  const out: string[] = [`CSH report for ${r.moduleDigest}`, `tool ${r.tool.version}, solver ${r.tool.solver}, budget ${r.tool.budgetMs} ms${r.snapshot !== undefined ? `, commit ${r.snapshot.commit}, ledger head ${r.snapshot.ledgerHead}` : ""}`, ""];
  const section = (title: string, fs: Finding[]) => {
    if (fs.length === 0) return;
    out.push(`== ${title}`, "");
    for (const f of fs) out.push(...finding(f), "");
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
  if (r.ledger !== undefined && r.ledger.invalid.length > 0) {
    out.push("== Ignored ledger entries", "");
    for (const e of r.ledger.invalid) out.push(`  seq ${e.seq}: ${e.reason}${e.commit !== undefined ? ` (commit ${e.commit.slice(0, 12)})` : ""}`);
    out.push("");
  }
  const count = (k: string) => r.findings.filter((f) => f.kind === k).length;
  out.push("== Counts", "");
  out.push(`  findings ${r.findings.length}: ${["state-conflict", "joint-conflict", "example-conflict", "arch-conflict", "example-divergence", "vacuous", "not-preserved", "not-met", "unknown"].map((k) => `${k} ${count(k)}`).join(", ")}`);
  out.push(`  gaps ${r.gapView.gaps.length}; not comparable ${r.notComparable.length}; unliftable ${r.unliftable.length}`);
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
