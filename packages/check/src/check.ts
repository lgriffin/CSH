// csh check: sections 1 to 6 of the Joint evaluation tab, plus the assessments of the
// Evidence tab. It reports and does not judge; blocking is the gate's job.
import type { Fragment, Module } from "@csh/kernel";
import type { SolverPort } from "@csh/solver";
import { assess, toolDigest } from "./assess.ts";
import { type EvidenceStore, MemoryEvidenceStore } from "./evidence.ts";
import { gapView } from "./gaps.ts";
import { prepare, type Prepared, type SourceRun } from "./pool.ts";
import { buildPool, runQueries } from "./run.ts";
import { ALL_CANDIDATE, type AuthorityInfo, type AuthorityResolver, type ComponentInfo, type Report, TOOL_VERSION } from "./types.ts";

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

export async function check(opts: CheckOptions): Promise<CheckResult> {
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const prepared = prepare(opts.module, opts.runs ?? []);
  const authority = resolveAll(prepared.fragments, opts.authority ?? ALL_CANDIDATE);
  const v = prepared.module.vocabulary;
  const env = { solver: opts.solver, vocabulary: v, budgetMs };
  const pool = buildPool(prepared.fragments, v, authority);
  const outcome = await runQueries(pool, env, authority);
  const gaps = await gapView({ prepared, pool, outcome, env, authority, ...(opts.component !== undefined ? { unowned: opts.component.unowned } : {}) });
  const tool = { version: TOOL_VERSION, solver: opts.solver.id, budgetMs };
  const assessInput: Parameters<typeof assess>[0] = {
    pool,
    fragments: prepared.fragments,
    outcome,
    witnesses: prepared.witnesses,
    authority,
    store: opts.evidence ?? new MemoryEvidenceStore(),
    toolDigest: toolDigest(tool, opts.configDigest),
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
      const e: Report["executions"][number] = { witness: w.witness.id, source: w.source, event: w.witness.event, localResult: w.witness.execution.localResult };
      if (w.witness.execution.test !== undefined) e.test = w.witness.execution.test;
      if (w.span !== undefined) e.span = w.span;
      return e;
    }),
    items: prepared.items.map((i) => {
      const it: Report["items"][number] = { source: i.source, id: i.id, span: i.span, textDigest: i.textDigest };
      if (i.pattern !== undefined) it.pattern = i.pattern;
      return it;
    }),
  };
  if (opts.snapshot !== undefined) report.snapshot = opts.snapshot;
  if (opts.ledger !== undefined) report.ledger = opts.ledger;
  if (opts.composition !== undefined) report.composition = opts.composition;
  if (opts.component !== undefined) report.component = { name: opts.component.name, digest: opts.component.digest, sources: opts.component.sources };
  return { report, prepared, authority };
}
