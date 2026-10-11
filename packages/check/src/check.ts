// csh check: sections 1 to 6 of the Joint evaluation tab, plus the assessments of the
// Evidence tab. It reports and does not judge; blocking is the gate's job.
import type { Fragment, Module } from "@csh/kernel";
import type { SolverPort } from "@csh/solver";
import { currentFacts, evaluateArchitecture } from "./arch.ts";
import { assess, toolDigest } from "./assess.ts";
import { type EvidenceStore, MemoryEvidenceStore } from "./evidence.ts";
import { outcomeOf } from "@csh/witness";
import { gapView } from "./gaps.ts";
import { prepare, type Prepared, type SourceRun } from "./pool.ts";
import { buildPool, runQueries, sortFindings } from "./run.ts";
import { testOutcomes } from "./results.ts";
import { trace } from "./trace.ts";
import { ALL_CANDIDATE, type AuthorityInfo, type AuthorityResolver, type ComponentInfo, type Gap, type HistoryPort, type Report, TOOL_VERSION } from "./types.ts";

export const DEFAULT_BUDGET_MS = 5000;

export interface CheckOptions {
  /** The emitted model and its digest. */
  module: Module;
  moduleDigest: string;
  /** Adapter output for each source (see runSources). */
  runs?: SourceRun[];
  solver: SolverPort;
  budgetMs?: number;
  authority?: AuthorityResolver;
  evidence?: EvidenceStore;
  snapshot?: { commit: string; ledgerHead: string; digest?: string };
  configDigest?: string;
  unchangedSince?: (ancestor: string, commit: string) => boolean;
  ledger?: Report["ledger"];
  composition?: Report["composition"];
  component?: ComponentInfo;
  /** The subject's pinned commit, when sources were read from a subject: facts taken at it are current (stage 23). */
  subjectCommit?: string;
  /** The files the repository tracks, relative to the root sources are read from; edges to files resolve against it. */
  files?: string[];
  /** The repository's history at the commit evaluated (stage 25): stale-prose and untraced-change come from it. */
  history?: HistoryPort;
}

export interface CheckResult {
  report: Report;
  prepared: Prepared;
  authority: Map<string, AuthorityInfo>;
}

export function resolveAll(fragments: Fragment[], resolver: AuthorityResolver): Map<string, AuthorityInfo> {
  const m = new Map<string, AuthorityInfo>();
  for (const f of fragments) m.set(f.name, resolver({ name: f.name, digest: f.digest, kind: f.kind, cites: f.cites }));
  return m;
}

/**
 * Commits that change the implementation with no test and no reference (stage 25). Who wrote one is told by its
 * trailers, and only annotates it: an agent's commit is no more or less a gap than a person's.
 */
function untracedChanges(h: HistoryPort | undefined): Gap[] {
  return (h?.untraced() ?? []).map((c) => ({ kind: "untraced-change", subject: `commit:${c.commit.slice(0, 12)}`, fragments: [], detail: `${c.date.slice(0, 10)}: changes ${c.files} implementation file${c.files === 1 ? "" : "s"}, with no test and no Refs: trailer${c.agent ? "; an agent co-authored it" : ""}` }));
}

export async function check(opts: CheckOptions): Promise<CheckResult> {
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const prepared = prepare(opts.module, opts.runs ?? []);
  const authority = resolveAll(prepared.fragments, opts.authority ?? ALL_CANDIDATE);
  const v = prepared.module.vocabulary;
  const env = { solver: opts.solver, vocabulary: v, budgetMs };
  const pool = buildPool(prepared.fragments, v, authority);
  const outcome = await runQueries(pool, env, authority);
  const arch = evaluateArchitecture({ prepared, fragments: prepared.fragments, authority, live: (n) => pool.byName.has(n), ...(opts.files !== undefined ? { files: opts.files } : {}), ...(opts.snapshot !== undefined ? { snapshotCommit: opts.snapshot.commit } : {}), ...(opts.subjectCommit !== undefined ? { subjectCommit: opts.subjectCommit } : {}), ...(opts.history !== undefined ? { history: opts.history } : {}) });
  outcome.findings = sortFindings([...outcome.findings, ...arch.findings]);
  const traced = trace({ prepared, facts: currentFacts(prepared.runs.flatMap((r) => r.output.facts ?? []), opts.snapshot?.commit, opts.subjectCommit), ...(opts.files !== undefined ? { files: opts.files } : {}), ...(opts.history !== undefined ? { history: opts.history } : {}) });
  const tested = testOutcomes(prepared, traced.edges);
  const gaps = await gapView({ prepared, pool, outcome, env, authority, archGaps: arch.gaps, traceGaps: [...traced.gaps, ...untracedChanges(opts.history), ...tested.gaps], ...(opts.component !== undefined ? { unowned: opts.component.unowned } : {}) });
  const tool = { version: TOOL_VERSION, solver: opts.solver.id, budgetMs };
  const assessInput: Parameters<typeof assess>[0] = {
    pool,
    fragments: prepared.fragments,
    outcome,
    witnesses: prepared.witnesses,
    authority,
    store: opts.evidence ?? new MemoryEvidenceStore(),
    toolDigest: toolDigest(tool, opts.configDigest),
    arch: arch.rules,
  };
  if (opts.snapshot !== undefined) assessInput.snapshotCommit = opts.snapshot.commit;
  if (opts.unchangedSince !== undefined) assessInput.unchangedSince = opts.unchangedSince;
  const assessments = assess(assessInput);
  const report: Report = {
    schema: "csh-report/v1",
    moduleDigest: opts.moduleDigest,
    tool,
    findings: outcome.findings,
    notComparable: prepared.notComparable,
    gapView: gaps.view,
    assessments,
    unliftable: prepared.unliftable,
    errors: gaps.errors,
    diagnostics: prepared.diagnostics,
    executions: prepared.witnesses.map((w) => {
      const e: Report["executions"][number] = { witness: w.witness.id, source: w.source, event: w.witness.event, localResult: outcomeOf(w.witness) };
      if (w.witness.execution.test !== undefined) e.test = w.witness.execution.test;
      if (w.span !== undefined) e.span = w.span;
      return e;
    }),
    examples: prepared.fragments.filter((f) => f.kind === "example").map((f) => ({ fragment: f.name, source: f.source, cites: f.cites.map((c) => `${c.source}/${c.id}`) })),
    items: prepared.items.map((i) => {
      const it: Report["items"][number] = { source: i.source, id: i.id, span: i.span, textDigest: i.textDigest };
      if (i.pattern !== undefined) it.pattern = i.pattern;
      if (i.kind !== undefined) it.kind = i.kind;
      if (i.attrs !== undefined) it.attrs = i.attrs;
      return it;
    }),
  };
  if (traced.edges.length > 0) report.edges = traced.edges;
  if (tested.outcomes.length > 0) report.outcomes = tested.outcomes;
  if (opts.snapshot !== undefined) report.snapshot = opts.snapshot;
  if (opts.ledger !== undefined) report.ledger = opts.ledger;
  if (opts.composition !== undefined) report.composition = opts.composition;
  if (opts.component !== undefined) report.component = { name: opts.component.name, digest: opts.component.digest, sources: opts.component.sources };
  return { report, prepared, authority };
}
