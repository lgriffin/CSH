// The A3 of an analysis (The analysis A3 and 1.0, section 1; stage 77): the analysis read as one problem, in the blocks
// of a Lean A3, with no person's judgment. Every number is counted from the analysis; what is a hypothesis (the
// mechanism behind a cause, the goal) says so. It decides nothing and changes no outcome.
import { type Analysis, languageName, languageStatus, type OverviewEntry, readLanguageOf } from "@csh/check";
import { compareCodePoints } from "@csh/kernel";

/** The causes of section 1, in the table's order; each kind belongs to one, and every other kind to the last. */
export const CAUSES: { cause: string; kinds: string[]; mechanism: string }[] = [
  {
    cause: "The code breaks a stated rule",
    kinds: ["violated", "not-met", "not-preserved", "failing-test"],
    mechanism: "The rule and the code changed apart, or the rule was never met: a change went in that the rule's checks did not stop.",
  },
  {
    cause: "Statements contradict each other",
    kinds: ["state-conflict", "joint-conflict", "example-conflict", "claim-conflict", "example-divergence", "vacuous"],
    mechanism: "Two practices state the same behaviour separately, each signed off alone, and nothing compares them.",
  },
  {
    cause: "Prose has drifted from the code",
    kinds: ["fact-conflict", "dangling-reference", "stale-prose", "status-unsupported", "symbol-undecided"],
    mechanism: "Documents are written once and the code they name moves on; nothing in the build reads them against the tree.",
  },
  {
    cause: "The design is drawn apart from the code",
    kinds: ["arch-conflict", "undrawn-dependency", "unobserved-relation", "unplaced-package"],
    mechanism: "The diagram is drawn by hand and the imports change with every pull request; nothing checks one against the other.",
  },
  {
    cause: "Claims nothing checks",
    kinds: ["unverified", "uncited", "unobserved-terms", "no-example", "no-rule", "single-source", "unexercised", "unbound", "stepless-scenario", "unbound-scenario", "undefined-step", "unused-step-definition"],
    mechanism: "Requirements and rules are written in prose, and tests are named for what they do rather than for what they verify, so no test cites them.",
  },
  {
    cause: "Test outputs out of step with their cases",
    kinds: ["unaccepted-case", "orphan-output", "obsolete-snapshot", "baselined", "shared-stem", "unpaired-outputs", "snapshot-undecided"],
    mechanism: "Cases and accepted outputs are added and removed by different commits, and the runner's skip list or update mode hides the difference.",
  },
  {
    cause: "Changes with no trace",
    kinds: ["untraced-change"],
    mechanism: "Commits change behaviour without a test or a trailer naming what they implement.",
  },
  {
    cause: "What CSH could not read or decide",
    kinds: [],
    mechanism: "The input is in a form CSH does not read, or needs a person or a run to decide; each entry says what would decide it.",
  },
];
const OTHER = CAUSES[CAUSES.length - 1]!;
const causeByKind = new Map(CAUSES.flatMap((c) => c.kinds.map((k) => [k, c] as const)));

/** The cause a kind belongs to (A-273). */
export const causeOf = (kind: string): string => (causeByKind.get(kind) ?? OTHER).cause;

const PLACE_DEPTH = 2;

/** The path an entry's subject names: less its source's name and any `#` fragment; empty for a source alone. */
const pathOf = (subject: string): string => (subject.includes("/") ? subject.slice(subject.indexOf("/") + 1) : "").split("#")[0]!;

/**
 * An entry's place (A-274): its subject less the source's name and any `#` fragment. A path with directories is
 * placed at its directory, to two levels, so that one change to a tree, or to a folder of documents, is one
 * countermeasure; a file at the root at itself; an item's identifier, with no directory and no extension, at its
 * source.
 */
export function placeOf(subject: string): string {
  const source = subject.split("/")[0]!;
  const path = pathOf(subject);
  if (path === "") return source;
  const dirs = path.split("/").slice(0, -1);
  if (dirs.length > 0) return dirs.slice(0, PLACE_DEPTH).join("/");
  return path.includes(".") ? path : source;
}

export interface SheetCause {
  cause: string;
  count: number;
  /** Its share of the gap and indeterminate entries, and the cumulative share up to it, each from 0 to 1. */
  share: number;
  cumulative: number;
  vital: boolean;
}

export interface Countermeasure {
  id: string;
  kind: string;
  cause: string;
  outcome: "gap" | "indeterminate";
  place: string;
  /** What would close every result of the group: the danger's `close` for a danger group, else the entries' `next`. */
  action: string;
  clears: number;
  danger: boolean;
  /** Every result of the group is in a file only an experimental reader reads (section 3). */
  experimental: boolean;
  /** The anchors of the group's first five results, in csh-analysis.html. */
  anchors: string[];
  /** The first result, so the action reads as something to do: its subject and the first part of its detail. */
  example: { subject: string; detail?: string };
}

export interface AnalysisSheet {
  schema: "csh-analysis-a3/v1";
  subject: { name: string; repo: string; commit: string };
  /** One sentence: the problem, counted. */
  problem: string;
  background: { profile: string; coverage?: string; told: number; guesses: number; experimental: string[] };
  current: {
    counts: { converged: number; gap: number; indeterminate: number };
    danger: { refuted: number; masked: number };
    practices: { practice: string; converged: number; gap: number; indeterminate: number }[];
  };
  pareto: SheetCause[];
  causes: { cause: string; count: number; kinds: { kind: string; count: number }[]; places: { place: string; count: number }[]; mechanism: string }[];
  goal: string[];
  countermeasures: Countermeasure[];
  /** Groups past the tenth, and the results they hold. */
  more: { countermeasures: number; results: number };
  followUp: { command: string; why: string }[];
}

/** How many countermeasures the sheet lists before it counts the rest. */
export const LISTED = 10;
const plural = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;

/** The repository's short name: the last segment of its origin or path. */
export const repoName = (repo: string): string => repo.replace(/\.git$/, "").split(/[/:\\]/).filter((x) => x !== "").pop() ?? "repository";

function countBy<T>(xs: readonly T[], key: (x: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || compareCodePoints(a.key, b.key));
}

const isExperimental = (e: OverviewEntry): boolean => {
  const lang = readLanguageOf(pathOf(e.subject));
  return lang !== undefined && languageStatus(lang) === "experimental";
};

/** The A3 of one analysis. */
export function analysisSheet(a: Analysis): AnalysisSheet {
  const entries = a.overview.entries;
  const open = entries.filter((e): e is OverviewEntry & { outcome: "gap" | "indeterminate" } => e.outcome !== "converged");
  const total = open.length;
  const { counts, danger } = a.overview;

  // Block 3: causes by count, ties by the table's order; vital up to the first that reaches 80%.
  const order = new Map(CAUSES.map((c, i) => [c.cause, i]));
  const byCause = countBy(open, (e) => causeOf(e.kind)).sort((x, y) => y.count - x.count || order.get(x.key)! - order.get(y.key)!);
  let running = 0;
  let reached = false;
  const pareto: SheetCause[] = byCause.map(({ key, count }) => {
    running += count;
    const vital = !reached;
    if (running * 5 >= total * 4) reached = true;
    return { cause: key, count, share: round(count / total), cumulative: round(running / total), vital };
  });

  // Block 4: for each vital cause, its kinds, its places and the usual mechanism.
  const causes = pareto.filter((p) => p.vital).map((p) => {
    const es = open.filter((e) => causeOf(e.kind) === p.cause);
    return {
      cause: p.cause,
      count: p.count,
      kinds: countBy(es, (e) => e.kind).map((k) => ({ kind: k.key, count: k.count })),
      places: countBy(es, (e) => placeOf(e.subject)).slice(0, 3).map((k) => ({ place: k.key, count: k.count })),
      mechanism: (CAUSES.find((c) => c.cause === p.cause) ?? OTHER).mechanism,
    };
  });

  // Block 6: one countermeasure per kind and place; danger first, then by what it clears.
  const groups = new Map<string, (OverviewEntry & { outcome: "gap" | "indeterminate" })[]>();
  for (const e of open) {
    // Danger is its own group: its action is to close the danger, which a group's other results do not need.
    const k = `${e.kind}\u0000${placeOf(e.subject)}\u0000${e.danger !== undefined}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const all = [...groups.values()].map((es) => {
    const e = es[0]!;
    return {
      kind: e.kind,
      cause: causeOf(e.kind),
      outcome: e.outcome,
      place: placeOf(e.subject),
      action: e.danger?.close ?? e.next,
      clears: es.length,
      danger: es.some((x) => x.danger !== undefined),
      experimental: es.every(isExperimental),
      anchors: es.slice(0, 5).map((x) => x.anchor),
      example: { subject: e.subject, ...(e.detail !== undefined && e.detail !== "" ? { detail: firstPart(e.detail) } : {}) },
    };
  }).sort((x, y) => Number(y.danger) - Number(x.danger) || y.clears - x.clears || compareCodePoints(x.kind, y.kind) || compareCodePoints(x.place, y.place));
  const countermeasures = all.slice(0, LISTED).map((c, i) => ({ id: `C${i + 1}`, ...c }));
  const rest = all.slice(LISTED);

  // Block 5: proposed, never set.
  const dangerous = entries.filter((e) => e.danger !== undefined).length;
  const top = pareto.find((p) => p.vital);
  const goal = total === 0
    ? ["Nothing to close: every result converged. Keep it so with csh analyse --expected in CI."]
    : [
        ...(dangerous > 0 ? [`Close the ${plural(dangerous, "danger entry", "danger entries")}: each is a statement the code refutes, or a check that cannot fail.`] : []),
        ...(top !== undefined ? [`Halve "${top.cause}": from ${top.count} to ${Math.floor(top.count / 2)} or fewer.`] : []),
        ...(counts.indeterminate > 0 ? [`Decide or justify the ${plural(counts.indeterminate, "indeterminate result")}.`] : []),
      ];

  const name = repoName(a.subject.repo);
  const experimental = (a.languages ?? []).filter((l) => l.status === "experimental" && l.files > 0).map((l) => languageName(l.language));
  const practices = countBy(entries, (e) => e.practice).map(({ key }) => ({
    practice: key,
    converged: entries.filter((e) => e.practice === key && e.outcome === "converged").length,
    gap: entries.filter((e) => e.practice === key && e.outcome === "gap").length,
    indeterminate: entries.filter((e) => e.practice === key && e.outcome === "indeterminate").length,
  }));
  const vital = pareto.filter((p) => p.vital);
  const vitalCount = vital.reduce((n, p) => n + p.count, 0);
  const problem = total === 0
    ? `CSH found no gap and nothing it could not decide in ${name}: all ${plural(counts.converged, "result")} converged.`
    : [
        `${name} has ${plural(counts.gap, "gap")} and ${plural(counts.indeterminate, "result")} CSH could not decide, against ${counts.converged} converged.`,
        ...(dangerous > 0 ? [`${dangerous} of them ${dangerous === 1 ? "is" : "are"} danger: a statement the code refutes, or a check that cannot fail.`] : []),
        vitalCount === total
          ? `${vital.length === 1 ? `All ${total} come from one cause` : `All ${total} come from ${vital.length} causes`}.`
          : `${vital.length === 1 ? "One cause accounts for" : `${vital.length} causes account for`} ${vitalCount} of the ${total}.`,
      ].join(" ");

  return {
    schema: "csh-analysis-a3/v1",
    subject: { name, repo: a.subject.repo, commit: a.subject.commit },
    problem,
    background: {
      profile: a.profile.kind === "proposed" ? "proposed for this analysis" : `given, at ${a.profile.dir}`,
      ...(a.coverage !== undefined ? { coverage: coverageText(a) } : {}),
      told: a.told.length,
      guesses: a.guesses.length,
      experimental,
    },
    current: { counts: { converged: counts.converged, gap: counts.gap, indeterminate: counts.indeterminate }, danger: { refuted: danger.refuted, masked: danger.masked }, practices },
    pareto,
    causes,
    goal,
    countermeasures,
    more: { countermeasures: rest.length, results: rest.reduce((n, c) => n + c.clears, 0) },
    followUp: [
      { command: `csh analyse <path> --at <commit>`, why: "after a countermeasure lands: its results should be gone" },
      { command: `csh analyse <path> --expected <file>`, why: "in CI, to hold what is closed closed (exits 1 on a difference)" },
      { command: `csh init --subject <path>`, why: "to keep a profile beside the repository, and open a component A3 that tracks judgments over commits" },
    ],
  };
}

/** The first part of a detail, shortened to a line. */
function firstPart(detail: string): string {
  const first = detail.split(/;\s+/)[0]!.replace(/^names what does not exist:\s*/, "");
  return first.length <= 160 ? first : `${first.slice(0, 157)}...`;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

function coverageText(a: Analysis): string {
  const c = a.coverage!;
  const eligible = c.eligible ?? c.tracked;
  return c.read === eligible ? `all ${eligible} eligible files read` : `${c.read} of ${eligible} eligible files read`;
}
