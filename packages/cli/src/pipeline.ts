// The full pipeline for one specification: emit, run sources, check. Used by the fixture
// runner, the walkthrough and the CLI tests.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { check, type CheckResult, type EvidenceStore, makeRefiner, type Report, type AuthorityResolver, type SourceRun } from "@csh/check";
import { runSources } from "./sources.ts";
import { emit, type EmitOptions, type EmitResult, type Lock } from "@csh/emit";
import { digestJson, fragmentsOf, refName, type Module } from "@csh/kernel";
import { type LedgerState, resolveAuthority } from "@csh/ledger";
import type { SolverPort } from "@csh/solver";

export interface FixtureConfig {
  budgetMs?: number;
  snapshot?: { commit: string; commitDate: string };
  requirementIdPattern?: string;
  mode?: "advisory" | "enforcing";
}

export function readConfig(dir: string): FixtureConfig {
  const p = join(dir, "inputs", "config.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as FixtureConfig) : {};
}

export interface PipelineOptions {
  root: string;
  solver: SolverPort;
  config?: FixtureConfig;
  /** A stand-in for the ledger, used by fixtures before stage 7. */
  authority?: AuthorityResolver;
  /** The ledger read from history; takes precedence over `authority`. */
  ledgerState?: LedgerState;
  evidence?: EvidenceStore;
  solverWrap?: (s: SolverPort) => SolverPort;
  emit?: EmitOptions;
  /** The lock file pinning pack versions and digests. */
  lock?: Lock;
  composition?: Report["composition"];
  /** The snapshot the report is for; overrides the one in the configuration. */
  snapshot?: { commit: string; ledgerHead: string; digest?: string };
  adapters?: Record<string, string>;
  isolatedAdapters?: boolean;
  unchangedSince?: (a: string, b: string) => boolean;
}

export interface PipelineResult {
  emitted: EmitResult;
  runs?: SourceRun[];
  checked?: CheckResult;
}

export async function evaluateSpec(spec: string, opts: PipelineOptions): Promise<PipelineResult> {
  const file = resolve(spec);
  const emitOpts: EmitOptions = { root: opts.root, refine: makeRefiner(opts.solver, opts.config?.budgetMs ?? 5000), ...(opts.emit ?? {}) };
  if (opts.lock !== undefined) emitOpts.lock = opts.lock;
  const emitted = await emit(file, emitOpts);
  if (!emitted.ok) return { emitted };
  const m = emitted.module;
  const composition = m.uses.length > 0 || (m.relaxations ?? []).length > 0 ? { uses: m.uses, inherited: emitted.composition.inherited.map((x) => x.name), relaxed: m.relaxations ?? [], refinements: emitted.composition.refinements } : undefined;
  return { emitted, ...(await checkModule(m, emitted.digest, composition !== undefined ? { ...opts, composition } : opts)) };
}

export async function checkModule(module: Module, moduleDigest: string, opts: PipelineOptions): Promise<{ runs: SourceRun[]; checked: CheckResult }> {
  const cfg = opts.config ?? {};
  const adapterConfig: Record<string, string> = {};
  if (cfg.requirementIdPattern !== undefined) adapterConfig.requirementIdPattern = cfg.requirementIdPattern;
  // Authority of bindings is needed before adapters run (they lift through bindings);
  // authority of everything else after, since cited items come from adapters.
  const state = opts.ledgerState;
  const emittedFragments = fragmentsOf(module);
  const bindingAuthority = (b: Module["bindings"][number]): string => {
    const name = `${module.system}/#binding/${refName(b.target)}`;
    const f = emittedFragments.find((x) => x.name === name);
    if (state !== undefined && f !== undefined) return resolveAuthority(state, f).authority;
    return opts.authority?.({ name, digest: f?.digest ?? "", kind: "binding", cites: [] }).authority ?? "candidate";
  };
  const runs = await runSources(module, { root: opts.root, config: adapterConfig, isolated: opts.isolatedAdapters ?? true, bindingAuthority, ...(opts.adapters !== undefined ? { adapters: opts.adapters } : {}) });
  const items = new Map<string, string>();
  for (const r of runs) for (const it of r.output.items ?? []) items.set(`${r.source}/${it.id}`, it.textDigest);
  const resolver: AuthorityResolver | undefined = state !== undefined ? (f) => resolveAuthority(state, f, items) : opts.authority;
  const checkOpts: Parameters<typeof check>[0] = {
    module,
    moduleDigest,
    runs,
    solver: opts.solverWrap !== undefined ? opts.solverWrap(opts.solver) : opts.solver,
    configDigest: digestJson(cfg),
  };
  if (cfg.budgetMs !== undefined) checkOpts.budgetMs = cfg.budgetMs;
  if (resolver !== undefined) checkOpts.authority = resolver;
  if (opts.evidence !== undefined) checkOpts.evidence = opts.evidence;
  if (opts.snapshot !== undefined) checkOpts.snapshot = opts.snapshot;
  else if (cfg.snapshot !== undefined) checkOpts.snapshot = { commit: cfg.snapshot.commit, ledgerHead: String(state?.head ?? 0) };
  if (state !== undefined) checkOpts.ledger = { head: state.head, invalid: state.invalid.map(({ seq, reason, commit }) => (commit !== undefined ? { seq, reason, commit } : { seq, reason })) };
  if (opts.unchangedSince !== undefined) checkOpts.unchangedSince = opts.unchangedSince;
  if (opts.composition !== undefined) checkOpts.composition = opts.composition;
  const checked = await check(checkOpts);
  return { runs, checked };
}

export function fixtureRoot(spec: string): string {
  return dirname(resolve(spec));
}
