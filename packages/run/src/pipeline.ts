// The full pipeline for one specification: emit, check the component manifest against the model, run sources,
// check. Used by csh check, csh run, the fixture runner and the tests.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { check, type CheckResult, type EvidenceStore, makeRefiner, type Report, type AuthorityResolver, type SourceRun } from "@csh/check";
import { runSources, type RunSourcesOptions } from "./sources.ts";
import { emit, type EmitOptions, type EmitResult, type Lock } from "@csh/emit";
import { digestJson, fragmentsOf, refName, type Module } from "@csh/kernel";
import { type LedgerState, resolveAuthority } from "@csh/ledger";
import { checkAgainstModule, type ComponentProblem, DEFAULT_EXECUTIONS, type LoadedComponent, ownersOf } from "@csh/component";
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
  /** The component manifest: it names each source's practice and adapter (Anchor, harnesses and A3, section 2). */
  component?: LoadedComponent;
  /** Without a component: the executions file joined to every Witnesses source (csh/config.json's `executions`). */
  executions?: string;
}

export interface PipelineResult {
  emitted: EmitResult;
  /** Errors in the component manifest against the emitted model. Nothing is checked while there is one. */
  componentErrors?: ComponentProblem[];
  runs?: SourceRun[];
  checked?: CheckResult;
}

/** An emitted specification with the component manifest checked against it: the first half of evaluateSpec. */
export interface Emission {
  emitted: EmitResult;
  /** Errors in the component manifest against the emitted model. Nothing is checked while there is one. */
  componentErrors?: ComponentProblem[];
}

/** Emit and check the manifest, without reading any source: csh run does this before any harness runs (#18). */
export async function emitSpec(spec: string, opts: PipelineOptions): Promise<Emission> {
  const emitOpts: EmitOptions = { root: opts.root, refine: makeRefiner(opts.solver, opts.config?.budgetMs ?? 5000), ...(opts.emit ?? {}) };
  if (opts.lock !== undefined) emitOpts.lock = opts.lock;
  const emitted = await emit(resolve(spec), emitOpts);
  if (!emitted.ok || opts.component === undefined) return { emitted };
  const errors = checkAgainstModule(opts.component.manifest, emitted.module, opts.root).errors;
  return errors.length > 0 ? { emitted, componentErrors: errors } : { emitted };
}

/** The whole pipeline; `emission`, when given, is one emitSpec already made for the same options and is reused. */
export async function evaluateSpec(spec: string, opts: PipelineOptions, emission?: Emission): Promise<PipelineResult> {
  const pre = emission ?? (await emitSpec(spec, opts));
  const emitted = pre.emitted;
  if (!emitted.ok || pre.componentErrors !== undefined) return pre;
  const m = emitted.module;
  const composition = m.uses.length > 0 || (m.relaxations ?? []).length > 0 ? { uses: m.uses, inherited: emitted.composition.inherited.map((x) => x.name), relaxed: m.relaxations ?? [], refinements: emitted.composition.refinements } : undefined;
  return { emitted, ...(await checkModule(m, emitted.digest, composition !== undefined ? { ...opts, composition } : opts)) };
}

/** Per-source adapter settings from the component manifest: each practice's adapter for the sources it owns. */
export function sourceSettings(c: LoadedComponent | undefined): RunSourcesOptions["perSource"] {
  if (c === undefined) return undefined;
  const out: NonNullable<RunSourcesOptions["perSource"]> = {};
  for (const p of c.manifest.practices) {
    for (const s of p.sources) {
      const set: NonNullable<RunSourcesOptions["perSource"]>[string] = {};
      if (p.adapter !== undefined) set.adapter = p.adapter;
      // An executions file is joined only where the practice names one: its harness's, or its own (#22).
      if (p.harness !== undefined) set.executions = p.harness.executions ?? DEFAULT_EXECUTIONS;
      else if (p.executions !== undefined) set.executions = p.executions;
      if (p.cites !== undefined) set.cites = p.cites;
      if (p.steps !== undefined) set.steps = p.steps;
      out[s] = set;
    }
  }
  return out;
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
  const perSource = sourceSettings(opts.component);
  const runs = await runSources(module, { root: opts.root, config: adapterConfig, isolated: opts.isolatedAdapters ?? true, bindingAuthority, ...(opts.adapters !== undefined ? { adapters: opts.adapters } : {}), ...(perSource !== undefined ? { perSource } : {}), ...(opts.executions !== undefined ? { executions: opts.executions } : {}) });
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
  if (opts.component !== undefined) {
    const { unowned } = checkAgainstModule(opts.component.manifest, module);
    checkOpts.component = { name: opts.component.manifest.name, digest: opts.component.digest, sources: ownersOf(opts.component.manifest), unowned };
  }
  const checked = await check(checkOpts);
  return { runs, checked };
}

export function fixtureRoot(spec: string): string {
  return dirname(resolve(spec));
}
