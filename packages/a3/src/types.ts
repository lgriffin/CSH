// The A3's two inputs and its one output (Anchor, harnesses and A3, section 5). Judgments are what only a person can
// say; stages are runs; the model is everything the sheet shows, rendered to Markdown and HTML and nothing else.
import type { Match, Signal } from "@csh/check";

export const JUDGMENTS_SCHEMA = "csh-a3-judgments/v1";
export const A3_SCHEMA = "csh-a3/v1";
/** Where an A3 lives in a component: csh/a3/<slug>/. */
export const A3_DIR = "csh/a3";

/**
 * Evidence for an answer: a quoted text in a file of the component as it stood at a stage's commit, or a finding id
 * in a stage's report. A file pointer with no stage is read at the first stage.
 */
export type Pointer = { file: string; text: string; stage?: string } | { finding: string; stage: string };

export const MARKS = ["says", "clash", "drift", "silent"] as const;
export type Mark = (typeof MARKS)[number];

export interface Judgments {
  schema: typeof JUDGMENTS_SCHEMA;
  title: string;
  problem: string;
  background: string[];
  stages: { id: string; name: string; what: string }[];
  /** What each practice cannot say, by practice id. */
  cannotSay: Record<string, string>;
  lanes: { id: string; practice: string; step: number; title: string; where: string; match: Match[] }[];
  causes: { id: string; name: string; match: Match[] }[];
  decisionPoints: {
    point: string;
    class: "contradiction" | "drift" | "silence";
    says: Record<string, { mark: Mark; text: string }>;
    note?: string;
    match: Match[];
  }[];
  goal: string;
  /** Measure id to target, where it differs from the default. */
  targets?: Record<string, string>;
  rca: { id: string; q: string; a: string; evidence?: Pointer; depth: string }[];
  whys: { q: string; a: string; evidence?: Pointer; root?: string }[];
  countermeasures: {
    id: string;
    kind: string;
    what: string;
    answers: string[];
    /** Signals present at the first stage that it should remove. */
    clears?: Match[];
    /** Signals that must appear once it is in place (section 12). */
    expects?: Match[];
    /** A stage that ends with the enforcing gate allowing once it is in place. */
    stage?: string;
    /** Extension: a measure that meets its target at the last stage once it is in place (A-45). */
    measure?: string;
  }[];
  plan: { what: string; who: string; when: string }[];
  /** Extension: terms the sheet uses, shown at its foot (A-45). */
  terms?: { term: string; meaning: string }[];
}

/** One stage as recorded: csh/a3/<slug>/stages/<id>/run.json, report.json and gate.json, parsed. */
export interface StageRecord {
  id: string;
  /** The run record (csh-run/v1). */
  run: { snapshot: { commit: string }; snapshotDigest: string; reportDigest: string; gateDigest: string; [k: string]: unknown };
  report: import("@csh/check").Report;
  gate: { mode: string; overall: string; obligations?: { fragment: string; disposition: string }[] };
  /** Digests of report.json and gate.json as read, byte for byte. */
  digests: { report: string; gate: string };
}

export type ProblemKind = "unclassified" | "dead-rule" | "dangling-pointer" | "unknown-practice" | "unanswered" | "unverifiable" | "missing-stage";

export interface Problem {
  kind: ProblemKind;
  /** What the problem is about: a signal, a rule, a pointer, a practice, a question or a countermeasure. */
  subject: string;
  detail: string;
  stage?: string;
}

export type Authority = { authority: "candidate"; reason?: string } | { authority: "approved"; selfApproved: boolean; needsReview?: boolean };

export type CountermeasureStatus = "verified" | "not cleared" | "nothing to clear" | "proposed" | "owner decides";

export interface SheetSignal extends Signal {
  label: string;
  /** The cause that places it, or none: unclassified. */
  cause?: string;
  lane?: string;
}

export interface SheetStage {
  id: string;
  name: string;
  what: string;
  tests: { passed: number; total: number };
  gate: { mode: string; overall: string };
  signals: SheetSignal[];
  conflicts: number;
  rules: { fragment: string; name: string; verdict: string; authority: string; selfApproved: boolean; disposition: string }[];
  examples: { total: number; citing: number };
}

export interface A3Model {
  schema: typeof A3_SCHEMA;
  slug: string;
  component: string;
  /** Digest of the judgments file; the fragment the ledger approves is <component>/#a3/<slug>. */
  judgmentsDigest: string;
  authority: Authority;
  /**
   * Who wrote the judgments (Next layers, section 6.5): the kind of the identity that signed the commit that last
   * changed the file; unknown when unsigned, unlisted or uncommitted. It informs the reader and decides nothing.
   */
  authoredBy?: "person" | "agent" | "unknown";
  title: string;
  problem: string;
  background: string[];
  practices: { id: string; name: string; kind: string; author?: string; unit?: string; sources: string[]; cannotSay?: string }[];
  stages: SheetStage[];
  lanes: { id: string; practice: string; step: number; title: string; where: string; counts: number[] }[];
  pareto: { stage: string; bars: { cause: string; name: string; n: number; cumulative: number; vital: boolean }[] }[];
  decisionPoints: { point: string; class: string; says: Record<string, { mark: Mark; text: string }>; note?: string; signals: string[][] }[];
  goal: string;
  measures: { id: string; name: string; target: string; values: { value: string; met: boolean }[] }[];
  rca: { id: string; q: string; a: string; evidence?: Pointer & { resolves: boolean }; depth: string }[];
  whys: { q: string; a: string; evidence?: Pointer & { resolves: boolean }; root?: string }[];
  countermeasures: { id: string; kind: string; what: string; answers: string[]; status: CountermeasureStatus }[];
  plan: { what: string; who: string; when: string }[];
  followUp: { gate: { mode: string; overall: string }; returned: string[] };
  terms: { term: string; meaning: string }[];
  problems: Problem[];
}
