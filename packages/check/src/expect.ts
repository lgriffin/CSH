// Expected results (Ingesting a codebase, stage 28): what a profile commits it expects of a run, checked against the
// overview of the run's report. An expectation names an outcome, a signal kind and a subject, and may name a span the
// entry's detail must hold; what CSH cannot establish is listed as unknown with a reason, and is not checked. The
// counts of each outcome are expected too, so a change to what CSH reports of a subject shows as a mismatch to review.
import type { Outcome, Overview, OverviewEntry } from "./overview.ts";

export interface Expectation {
  outcome: Outcome;
  kind: string;
  subject: string;
  /** A span, such as `guides/CHARTER.md:896`, that the entry's detail must hold. */
  at?: string;
}

export interface ExpectedRow {
  row: number;
  /** What the row is, in the profile's own words. */
  title: string;
  expect: Expectation[];
  /** Parts of the row CSH cannot establish, each with why. */
  unknown?: { what: string; reason: string }[];
}

export interface Expected {
  schema: "csh-expected/v1";
  counts?: Partial<Record<Outcome, number>>;
  /** Each told rule's expected rung on the Assertion Ladder (stage 47), by Source/id. */
  rungs?: Record<string, string>;
  rows: ExpectedRow[];
}

export interface ExpectMismatch {
  row?: number;
  message: string;
}

export interface ExpectResult {
  /** Each row: reported when all its expectations are met, unknown when it has none and lists what is unknown. */
  rows: { row: number; title: string; status: "reported" | "partly-unknown" | "unknown" | "missing"; met: number; of: number; unknown: number }[];
  mismatches: ExpectMismatch[];
}

/** An entry meets an expectation when outcome, kind and subject agree and its detail holds the span, ending there. */
function meets(e: OverviewEntry, x: Expectation): boolean {
  if (e.outcome !== x.outcome || e.kind !== x.kind || e.subject !== x.subject) return false;
  if (x.at === undefined) return true;
  const d = e.detail ?? "";
  for (let i = d.indexOf(x.at); i >= 0; i = d.indexOf(x.at, i + 1)) if (!/[0-9]/.test(d[i + x.at.length] ?? "")) return true;
  return false;
}

/** A malformed expected file is a problem, never an empty set of expectations. */
export function parseExpected(text: string): { expected?: Expected; problems: string[] } {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (err) {
    return { problems: [`not JSON: ${(err as Error).message}`] };
  }
  const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
  if (!isObj(v) || v.schema !== "csh-expected/v1" || !Array.isArray(v.rows)) return { problems: ["not a csh-expected/v1 file with rows"] };
  const problems: string[] = [];
  v.rows.forEach((r: unknown, i) => {
    if (!isObj(r) || typeof r.row !== "number" || typeof r.title !== "string" || !Array.isArray(r.expect)) problems.push(`rows[${i}] needs a row, a title and expect`);
    else
      r.expect.forEach((x: unknown, j) => {
        if (!isObj(x) || typeof x.outcome !== "string" || typeof x.kind !== "string" || typeof x.subject !== "string") problems.push(`rows[${i}].expect[${j}] needs an outcome, a kind and a subject`);
      });
  });
  if (v.rungs !== undefined && (!isObj(v.rungs) || Object.values(v.rungs).some((r) => typeof r !== "string" || !/^L[2-5]$/.test(r)))) problems.push("rungs maps each told rule to L2, L3, L4 or L5");
  return problems.length > 0 ? { problems } : { expected: v as unknown as Expected, problems };
}

export function checkExpected(overview: Overview, expected: Expected): ExpectResult {
  const mismatches: ExpectMismatch[] = [];
  const rows: ExpectResult["rows"] = [];
  for (const r of expected.rows) {
    let met = 0;
    for (const x of r.expect) {
      if (overview.entries.some((e) => meets(e, x))) met++;
      else mismatches.push({ row: r.row, message: `no ${x.outcome} ${x.kind} for ${x.subject}${x.at !== undefined ? ` at ${x.at}` : ""}` });
    }
    const unknown = r.unknown?.length ?? 0;
    const status = met < r.expect.length ? "missing" : r.expect.length === 0 ? (unknown > 0 ? "unknown" : "missing") : unknown > 0 ? "partly-unknown" : "reported";
    if (r.expect.length === 0 && unknown === 0) mismatches.push({ row: r.row, message: "the row expects nothing and lists nothing unknown" });
    rows.push({ row: r.row, title: r.title, status, met, of: r.expect.length, unknown });
  }
  for (const [o, n] of Object.entries(expected.counts ?? {}) as [Outcome, number][]) {
    if (overview.counts[o] !== n) mismatches.push({ message: `${overview.counts[o]} ${o} entries, expected ${n}` });
  }
  const rungs = new Map((overview.rungs ?? []).map((r) => [r.item, r.rung]));
  for (const [item, want] of Object.entries(expected.rungs ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const got = rungs.get(item);
    if (got !== want) mismatches.push({ message: got === undefined ? `${item} is not a told rule of the run, expected at ${want}` : `${item} is at ${got}, expected ${want}` });
  }
  return { rows, mismatches };
}

export function renderExpect(r: ExpectResult): string {
  const lines = r.rows.map((x) => `  row ${String(x.row).padStart(2)}  ${x.status.padEnd(14)} ${x.met}/${x.of} met${x.unknown > 0 ? `, ${x.unknown} unknown` : ""}  ${x.title}`);
  const tail = r.mismatches.length === 0 ? ["every expectation met"] : r.mismatches.map((m) => `mismatch${m.row !== undefined ? ` (row ${m.row})` : ""}: ${m.message}`);
  return `${["Expected results", ...lines, ...tail].join("\n")}\n`;
}
