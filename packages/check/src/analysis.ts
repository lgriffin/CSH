// The analysis (Analyse, danger and grain, section 2; stage 55): what `csh analyse` reports of one repository, read cold
// or through a profile. It is the overview of one run, with what the run was made from (the subject, the profile and
// every guess it made, the coverage, the told rules lifted from prose) and its results in the order the specification
// gives: danger, conflicts, gaps, indeterminate, converged, then counts. It decides nothing the overview does not.
import type { ExpectResult } from "./expect.ts";
import { ladderLine } from "./ladder.ts";
import { dangerLine } from "./danger.ts";
import { dangerHtml, type OverviewEntry, type Overview, renderOverviewHtml } from "./overview.ts";

export interface Analysis {
  schema: "csh-analysis/v1";
  /** The repository read: the path given, its origin (or the path when it has none), and the commit read. */
  subject: { path: string; repo: string; commit: string };
  /** A profile proposed for this run, or the directory of the one given (or found beside the subject). */
  profile: { kind: "proposed" } | { kind: "given"; dir: string };
  /** Each guess the proposal made, with what it was read from; empty for a given profile. */
  guesses: string[];
  /** Tracked files read and not read, when the profile declares its sources. */
  coverage?: { tracked: number; read: number; byName?: number; unread: { ext: string; files: number; sample: string }[] };
  /** Told rules lifted from prose, each an item at its line. */
  told: { item: string; lifted: string; span: string; text: string }[];
  overview: Overview;
  /** The profile's expected results compared with the overview, when the profile has them. */
  expect?: ExpectResult;
}

/** Overview kinds that are two statements disagreeing: a joint conflict, or two examples that diverge. */
export const CONFLICT_KINDS = new Set(["state-conflict", "joint-conflict", "example-conflict", "arch-conflict", "claim-conflict", "example-divergence"]);

export interface AnalysisSections {
  danger: OverviewEntry[];
  conflicts: OverviewEntry[];
  gaps: OverviewEntry[];
  indeterminate: OverviewEntry[];
  converged: OverviewEntry[];
}

/**
 * The entries of an analysis in the order it reports them; each entry is in exactly one section. A dangerous entry is
 * reported first, under Danger, and keeps its outcome there (stage 56).
 */
export function sectionsOf(a: Analysis): AnalysisSections {
  const danger = a.overview.entries.filter((e) => e.danger !== undefined);
  const es = a.overview.entries.filter((e) => e.danger === undefined);
  const conflict = (e: OverviewEntry) => e.outcome === "gap" && CONFLICT_KINDS.has(e.kind);
  return {
    danger,
    conflicts: es.filter(conflict),
    gaps: es.filter((e) => e.outcome === "gap" && !conflict(e)),
    indeterminate: es.filter((e) => e.outcome === "indeterminate"),
    converged: es.filter((e) => e.outcome === "converged"),
  };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** One entry in full: its kind, subject and id, each part of its evidence, and what would move it. */
function entryLines(e: OverviewEntry): string[] {
  const lines = [`  ${e.danger !== undefined ? `${e.outcome} ` : ""}${e.kind}  ${e.subject}${e.rung !== undefined ? `  (${e.rung})` : ""}  [${e.anchor}]`];
  if (e.danger !== undefined) lines.push(`    danger: ${dangerLine(e.danger)}`);
  for (const part of (e.detail ?? "").split(/;\s+/).filter((x) => x !== "")) lines.push(`    - ${part}`);
  lines.push(`    ${e.danger !== undefined ? `close: ${e.danger.close}` : `next: ${e.next}`}`);
  return lines;
}

/** Entries by kind, each kind with its count, what would move it, and its first subjects. */
function byKind(es: OverviewEntry[], shown = 3): string[] {
  const kinds = new Map<string, OverviewEntry[]>();
  for (const e of es) kinds.set(e.kind, [...(kinds.get(e.kind) ?? []), e]);
  const out: string[] = [];
  for (const [kind, list] of [...kinds].sort((x, y) => y[1].length - x[1].length || (x[0] < y[0] ? -1 : 1))) {
    out.push(`  ${String(list.length).padStart(4)}  ${kind}: ${list[0]!.next}`);
    for (const e of list.slice(0, shown)) out.push(`          ${e.subject}`);
    if (list.length > shown) out.push(`          and ${list.length - shown} more`);
  }
  return out;
}

/** The analysis as text: what was read, then each section in order, then the counts. */
export function renderAnalysis(a: Analysis): string {
  const s = sectionsOf(a);
  const lifted = (k: string) => a.told.filter((t) => t.lifted === k).length;
  const out = [`CSH analysis of ${a.subject.repo} at ${a.subject.commit.slice(0, 12)}`];
  out.push(a.profile.kind === "proposed" ? `  profile: proposed, ${`${a.guesses.length} ${a.guesses.length === 1 ? "guess" : "guesses"}`} (csh analyse --json lists them); nothing is written into the subject` : `  profile: ${a.profile.dir}`);
  const byName = (a.coverage?.byName ?? 0) > 0 ? ` (${a.coverage!.byName} by name)` : "";
  if (a.coverage !== undefined) out.push(a.coverage.read === a.coverage.tracked ? `  coverage: all ${a.coverage.tracked} tracked files read${byName}` : `  coverage: ${a.coverage.read} of ${a.coverage.tracked} tracked files read${byName}; not read: ${a.coverage.unread.slice(0, 3).map((u) => `${u.files} ${u.ext}`).join(", ")}${a.coverage.unread.length > 3 ? ", …" : ""}`);
  out.push(`  told rules lifted from prose: ${a.told.length} (${lifted("layering")} layering, ${lifted("ears")} EARS), each cited as its sentence`, "");
  out.push(`== Danger (${s.danger.length}): refuted or masked, never scored; each keeps its outcome`);
  if (s.danger.length === 0) out.push("  none established");
  for (const e of s.danger) out.push(...entryLines(e));
  out.push("");
  out.push(`== Conflicts (${s.conflicts.length})`);
  if (s.conflicts.length === 0) out.push("  none");
  for (const e of s.conflicts) out.push(...entryLines(e));
  out.push("", `== Gaps (${s.gaps.length}): suggestions, each with what would close it`, ...byKind(s.gaps), "");
  out.push(`== Indeterminate (${s.indeterminate.length}): what could not be decided, with what would decide it`, ...byKind(s.indeterminate), "");
  out.push(`== Converged (${s.converged.length}): what the evidence bears out`, ...byKind(s.converged, 2), "");
  out.push("== Counts", `  ${a.overview.counts.gap} gaps, ${a.overview.counts.indeterminate} indeterminate, ${a.overview.counts.converged} converged`, `  of these, ${a.overview.danger.refuted} refuted and ${a.overview.danger.masked} masked`);
  if (a.overview.ladder !== undefined) out.push(`  ${ladderLine(a.overview.ladder)}`);
  if (a.expect !== undefined) out.push(`  expected results: ${a.expect.mismatches.length === 0 ? "every expectation met" : plural(a.expect.mismatches.length, "mismatch")}`);
  out.push("");
  return out.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The analysis as one HTML sheet: what was read, danger and conflicts in full, then the overview's three outcomes. */
export function renderAnalysisHtml(a: Analysis, title: string): string {
  const s = sectionsOf(a);
  const full = (es: OverviewEntry[]) =>
    es.length === 0
      ? `<p class="none">None.</p>`
      : `<ul>${es.map((e) => `<li id="${esc(e.anchor)}"><div class="subject"><code>${esc(e.kind)}</code> ${esc(e.subject)}${e.rung !== undefined ? ` <span class="rung ${e.rung}">${e.rung}</span>` : ""}</div>${e.danger !== undefined ? dangerHtml(e.danger) : ""}<ul class="detail">${(e.detail ?? "").split(/;\s+/).filter((x) => x !== "").map((x) => `<li>${esc(x)}</li>`).join("")}<li class="next">next: ${esc(e.next)}</li></ul></li>`).join("")}</ul>`;
  const before = [
    `<section class="read"><p>${esc(a.subject.repo)} at <code>${esc(a.subject.commit)}</code>; profile ${a.profile.kind === "proposed" ? "proposed for this run" : esc(a.profile.dir)}.</p>`,
    a.guesses.length > 0 ? `<details><summary>${a.guesses.length} guesses</summary><ul>${a.guesses.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></details>` : "",
    a.told.length > 0 ? `<details><summary>${a.told.length} told rules lifted from prose</summary><ul>${a.told.map((t) => `<li><code>${esc(t.span)}</code> ${esc(t.lifted)}: ${esc(t.text)}</li>`).join("")}</ul></details>` : "",
    `</section>`,
    `<details class="outcome danger" id="danger" open><summary><h2>Danger <small>${s.danger.length}</small></h2></summary>${full(s.danger)}</details>`,
    `<details class="outcome conflicts" id="conflicts" open><summary><h2>Conflicts <small>${s.conflicts.length}</small></h2></summary>${full(s.conflicts)}</details>`,
  ].join("\n");
  const shown = new Set([...s.danger, ...s.conflicts].map((e) => e.anchor));
  return renderOverviewHtml({ ...a.overview, entries: a.overview.entries.filter((e) => !shown.has(e.anchor)) }, title, { before });
}
