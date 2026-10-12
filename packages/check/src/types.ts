// The report (csh-report/v1) and the records it carries (Joint evaluation, section 6;
// Semantic contract, section 6). Fields marked "extension" are additions this
// implementation makes; they are listed in ASSUMPTIONS.md.

export type Authority = "approved" | "candidate" | "retired";

/** What the ledger (or a test's stand-in for it) says about one fragment. */
export interface AuthorityInfo {
  authority: Authority;
  /** Why a fragment is candidate when an approval exists, such as source-text-changed. */
  reason?: string;
  selfApproved?: boolean;
  needsReview?: boolean;
  /** Ledger sequence number of the deciding entry. */
  seq?: number;
}

export type AuthorityResolver = (fragment: { name: string; digest: string; kind: string; cites: { source: string; id: string }[] }) => AuthorityInfo;

export const ALL_CANDIDATE: AuthorityResolver = () => ({ authority: "candidate" });

export type FindingKind = "state-conflict" | "vacuous" | "joint-conflict" | "example-conflict" | "example-divergence" | "not-preserved" | "not-met" | "unknown" | "arch-conflict" | "fact-conflict" | "claim-conflict";

export interface Member {
  fragment: string;
  source: string;
  authority: string;
  digest: string;
}

export interface Finding {
  id: string;
  kind: FindingKind;
  scope: "specification" | "implementation";
  members: Member[];
  context: string[];
  crossSource: boolean;
  collisionTerms: string[];
  witness?: Record<string, string>;
  reason?: string;
  incomplete?: boolean;
  /**
   * For Q-DIV: identical when both examples state every field and argument with equal values; overlapping when the
   * inputs can coincide but one leaves something unstated (Anchor, harnesses and A3, section 6.1).
   */
  inputs?: "identical" | "overlapping";
  /** Extension: the query that produced the finding, such as Q-FEAS(Withdraw). */
  query: string;
}

export type Cell = "asserts" | "exemplifies" | "models" | "unliftable" | "silent";

export interface Gap {
  kind: string;
  subject: string;
  fragments: string[];
  detail?: string;
}

export interface GapView {
  sources: string[];
  rows: { subject: string; cells: Record<string, Cell> }[];
  gaps: Gap[];
}

export type Applicability = "current" | "stale" | "inapplicable" | "unavailable";
export type Verdict = "conflicting" | "violated" | "satisfied" | "unknown";

export interface EvidenceRecord {
  witness: string;
  source: string;
  applicability: "current" | "stale" | "inapplicable";
  reason?: string;
  /** holds, violated, or precondition-not-met (a pre-state invariant was already false). */
  result?: "holds" | "violated" | "precondition-not-met" | "not-evaluated";
  /** Substituted values, by term, integers as decimal strings. */
  values?: Record<string, string>;
  /** True when some requirement's trigger on the witness's event is true in it. */
  boundary?: boolean;
  span?: string;
}

export interface MethodStatus {
  method: string;
  met: boolean;
  reason?: string;
}

export interface Assessment {
  fragment: string;
  kind: string;
  source: string;
  digest: string;
  authority: Authority;
  authorityReason?: string;
  selfApproved: boolean;
  needsReview: boolean;
  verdict: Verdict;
  scope?: "specification" | "implementation";
  applicability: Applicability;
  policy?: string;
  critical: boolean;
  methods: MethodStatus[];
  evidence: EvidenceRecord[];
  /** For unknown: the missing items. For other verdicts: what decided it. */
  reasons: string[];
  findings: string[];
  /**
   * Who wrote the fragment's current digest (Next layers, section 6.5): the kind of the identity that signed the commit
   * that last changed it. Present once a maintainers file was committed. It informs the reviewer and never a verdict.
   */
  authoredBy?: "person" | "agent" | "unknown";
}

export interface ReportError {
  code: string;
  severity: "error" | "warning" | "info";
  detail: string;
  fragment?: string;
  source?: string;
  span?: string;
}

/** What the check needs to know of a component manifest; the manifest itself is read by @csh/component. */
export interface ComponentInfo {
  name: string;
  digest: string;
  /** The practice that owns each source, by source name. */
  sources: Record<string, string>;
  /** Sources the specification declares and no practice names. */
  unowned: string[];
}

export interface Report {
  schema: "csh-report/v1";
  moduleDigest: string;
  snapshot?: { commit: string; ledgerHead: string; digest?: string };
  tool: { version: string; solver: string; budgetMs: number };
  findings: Finding[];
  notComparable: { fragment: string; source: string; reason: string; detail?: string }[];
  gapView: GapView;
  assessments?: Assessment[];
  /** Extension: content no adapter could lift, with its span (Evidence tab, section 4). */
  unliftable: { source: string; span: string; reason: string; text: string }[];
  /** Extension: harness errors and warnings, such as dangling-citation and shape-mismatch. */
  errors: ReportError[];
  /** Extension: adapter diagnostics, by source. */
  diagnostics: { source: string; code: string; severity: string; message: string; span?: string }[];
  /**
   * Extension: what test runners said, counted per test file and per item a test cites (Ingesting a codebase, stage
   * 26). Present when a test-file source read results; never entering a verdict (P2).
   */
  outcomes?: { item: string; tests: number; passed: number; failed: number; errored: number; skipped: number }[];
  /**
   * Extension: for each item whose "verified by" names test files (a file, a directory, or a unique bare name), what
   * the runner said of those files (stage 27): how many it names, how many reported no result, and the counts of the
   * rest. A test that does not name the item still says nothing of which item it checks, so this is reported apart
   * from `outcomes`, and never enters a verdict (P2).
   */
  verifiedBy?: { item: string; files: number; unreported: number; tests: number; passed: number; failed: number; errored: number; skipped: number }[];
  /** Extension: test executions, stored and reported, never entering a verdict (P2). */
  executions: { witness: string; source: string; event: string; localResult: string; test?: string; span?: string }[];
  /**
   * Extension: every example in the pool, with its source and the items it cites as source/id (Anchor, harnesses and
   * A3, section 12: the measure "examples that cite a requirement").
   */
  examples?: { fragment: string; source: string; cites: string[] }[];
  /** Extension: identified source items (adapter B). */
  items: { source: string; id: string; pattern?: string; span: string; textDigest: string; kind?: string; attrs?: Record<string, string> }[];
  /**
   * Extension: edges the inventory adapters read (Ingesting a codebase, stage 22), with the item each resolved to as
   * Source/id, and `dangling` when it names nothing. Present when some source produced an edge.
   */
  edges?: { source: string; from: string; rel: string; to: string; span: string; target?: string; dangling?: true }[];
  /** Extension: invalid ledger entries, present from stage 7. */
  ledger?: { head: number; invalid: { seq: number; reason: string; commit?: string }[] };
  /**
   * The component the report is for, and the practice that owns each source (Anchor, harnesses and A3, section 6.4).
   * Present when the project has a component manifest.
   */
  component?: { name: string; digest: string; sources: Record<string, string> };
  /** The repository evaluated from outside, at its pinned commit, when the component names one (stage 21). */
  subject?: { repo: string; commit: string };
  /** Extension: composition results, present from stage 8. */
  composition?: { uses: { pack: string; version: string; digest: string }[]; inherited: string[]; relaxed: { obligation: string; owner: string; reason: string }[]; refinements: { obligation: string; pack: string; result: string }[] };
}

/** A commit and its committer date (ISO 8601). */
export interface Dated {
  commit: string;
  date: string;
}

/**
 * What the repository's history says (Ingesting a codebase, stage 25): read from git by @csh/run, at the commit under
 * evaluation. Paths are relative to the root sources are read from. Every answer is undefined, or empty, when history
 * cannot tell: a line not committed yet, a path git does not know.
 */
export interface HistoryPort {
  /** The commit that last changed a line, as blame tells it. */
  lineCommit(path: string, line: number): Dated | undefined;
  /** The oldest commit in the line's own history, as `git log -L` follows it: when the sentence was first written. */
  lineOrigin(path: string, line: number): Dated | undefined;
  /** The commits after `commit`, up to the one evaluated, that changed `path`, newest first. */
  changedSince(commit: string, path: string): Dated[];
  /** The newest commit that changed how often `text` occurs in `path`: for a value present now, the one that wrote it. */
  introduced(path: string, text: string): Dated | undefined;
  /** Commits since the configured start that change implementation paths with no test and no `Refs:` trailer. */
  /** Whether a document records a moment, and so is not described stale by a later change to a file it names. */
  frozen?(path: string): boolean;
  untraced(): { commit: string; date: string; files: number; agent: boolean }[];
}

export const TOOL_VERSION = "0.1.0";
