// Labelled results (The analysis A3 and 1.0, section 4; stage 79): a person's judgment of each gap and indeterminate
// entry of one analysis, true when the entry is right about the repository and false when it is not. CSH never labels
// its own results: a labels file is written by hand, kept outside the subject, and read only to measure. The measure is
// precision, by kind; the gate is that every open entry is labelled, every label still names an entry, and no refuted
// entry is labelled false.
import type { Outcome, Overview } from "./overview.ts";

export interface Label {
  outcome: Exclude<Outcome, "converged">;
  kind: string;
  subject: string;
  /** True when the entry is right about the repository: acting on it would be right. */
  label: boolean;
  /** Why, in a sentence a reviewer can check against the repository. */
  why: string;
}

export interface Labels {
  schema: "csh-labels/v1";
  /** The commit the labels judge; an analysis of another commit is not measured by them. */
  subject: { repo: string; commit: string };
  labels: Label[];
}

export interface LabelResult {
  /** Open entries, and how many of them are labelled true and false. */
  open: number;
  true: number;
  false: number;
  byKind: { kind: string; true: number; false: number }[];
  /** Every way the labels and the analysis disagree; any one fails `csh analyse --labels`. */
  mismatches: string[];
}

const key = (outcome: string, kind: string, subject: string) => `${outcome}\u0000${kind}\u0000${subject}`;

/** A malformed labels file is a problem, never an empty set of labels. */
export function parseLabels(text: string): { labels?: Labels; problems: string[] } {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (err) {
    return { problems: [`not JSON: ${(err as Error).message}`] };
  }
  const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
  if (!isObj(v) || v.schema !== "csh-labels/v1" || !isObj(v.subject) || typeof v.subject.repo !== "string" || v.subject.repo === "" || typeof v.subject.commit !== "string" || !Array.isArray(v.labels)) return { problems: ["not a csh-labels/v1 file with a subject repo and commit and labels"] };
  const problems: string[] = [];
  v.labels.forEach((l: unknown, i) => {
    if (!isObj(l) || (l.outcome !== "gap" && l.outcome !== "indeterminate") || typeof l.kind !== "string" || typeof l.subject !== "string" || typeof l.label !== "boolean" || typeof l.why !== "string" || l.why.trim() === "")
      problems.push(`labels[${i}] needs an outcome (gap or indeterminate), a kind, a subject, a label (true or false) and why`);
  });
  return problems.length > 0 ? { problems } : { labels: v as unknown as Labels, problems };
}

/** Each open entry meets one label of its outcome, kind and subject; a subject reported twice needs two labels. */
export function checkLabels(overview: Overview, labels: Labels, commit: string): LabelResult {
  const mismatches: string[] = [];
  if (labels.subject.commit !== commit) mismatches.push(`the labels judge ${labels.subject.commit}, and the analysis read ${commit}`);
  const pool = new Map<string, Label[]>();
  for (const l of labels.labels) {
    const k = key(l.outcome, l.kind, l.subject);
    pool.set(k, [...(pool.get(k) ?? []), l]);
  }
  const kinds = new Map<string, { true: number; false: number }>();
  let open = 0;
  let yes = 0;
  for (const e of overview.entries) {
    if (e.outcome === "converged") continue;
    open++;
    const left = pool.get(key(e.outcome, e.kind, e.subject)) ?? [];
    const l = left.shift();
    if (l === undefined) {
      mismatches.push(`unlabelled: ${e.outcome} ${e.kind} ${e.subject}`);
      continue;
    }
    const n = kinds.get(e.kind) ?? { true: 0, false: 0 };
    kinds.set(e.kind, n);
    if (l.label) {
      yes++;
      n.true++;
    } else {
      n.false++;
      if (e.danger?.structure === "refuted") mismatches.push(`refuted and labelled false: ${e.kind} ${e.subject} (${l.why})`);
    }
  }
  for (const left of pool.values()) for (const l of left) mismatches.push(`a label names no entry: ${l.outcome} ${l.kind} ${l.subject}`);
  const labelled = [...kinds.values()].reduce((s, n) => s + n.true + n.false, 0);
  const byKind = [...kinds].map(([kind, n]) => ({ kind, ...n })).sort((a, b) => b.true + b.false - (a.true + a.false) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  return { open, true: yes, false: labelled - yes, byKind, mismatches };
}

const pct = (n: number, d: number) => (d === 0 ? "-" : `${Math.round((n / d) * 100)}%`);

/** The precision lines: overall, then by kind, then each mismatch. */
export function renderLabels(r: LabelResult): string {
  const lines = [`Labels: ${r.true} of ${r.true + r.false} labelled open entries are true (${pct(r.true, r.true + r.false)} precision), of ${r.open} open`];
  for (const k of r.byKind) lines.push(`  ${k.kind.padEnd(24)} ${String(k.true).padStart(4)} true ${String(k.false).padStart(4)} false  ${pct(k.true, k.true + k.false).padStart(4)}`);
  lines.push(...(r.mismatches.length === 0 ? ["every open entry labelled, every label used, no refuted entry labelled false"] : r.mismatches.map((m) => `mismatch: ${m}`)));
  return `${lines.join("\n")}\n`;
}
