// The full pipeline for one specification: emit, run sources, check. Used by the fixture
// runner, the walkthrough and the CLI tests.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { check, type CheckResult, type EvidenceStore, runSources, type AuthorityResolver, type SourceRun } from "@csh/check";
import { emit, type EmitOptions, type EmitResult } from "@csh/emit";
import { digestJson, type Module } from "@csh/kernel";
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
  authority?: AuthorityResolver;
  /** Authority used for bindings when adapters run (defaults to `authority`). */
  evidence?: EvidenceStore;
  emit?: EmitOptions;
  ledger?: Parameters<typeof check>[0]["ledger"];
  ledgerHead?: string;
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
  const emitted = await emit(file, { root: opts.root, ...(opts.emit ?? {}) });
  if (!emitted.ok) return { emitted };
  return { emitted, ...(await checkModule(emitted.module, emitted.digest, opts)) };
}

export async function checkModule(module: Module, moduleDigest: string, opts: PipelineOptions): Promise<{ runs: SourceRun[]; checked: CheckResult }> {
  const cfg = opts.config ?? {};
  const adapterConfig: Record<string, string> = {};
  if (cfg.requirementIdPattern !== undefined) adapterConfig.requirementIdPattern = cfg.requirementIdPattern;
  const resolver = opts.authority;
  const runs = await runSources(module, {
    root: opts.root,
    config: adapterConfig,
    isolated: opts.isolatedAdapters ?? true,
    bindingAuthority: (b) => {
      if (resolver === undefined) return "candidate";
      const name = `${module.system}/#binding/${b.target.k === "field" ? `${b.target.state}.${b.target.field}` : b.target.k === "arg" ? `${b.target.event}.args.${b.target.name}` : `${b.target.event}.result`}`;
      // The digest is recomputed by the resolver's caller; here only the name decides a stand-in resolver.
      return resolver({ name, digest: "", kind: "binding", cites: [] }).authority;
    },
  });
  const checkOpts: Parameters<typeof check>[0] = {
    module,
    moduleDigest,
    runs,
    solver: opts.solver,
    configDigest: digestJson(cfg),
  };
  if (cfg.budgetMs !== undefined) checkOpts.budgetMs = cfg.budgetMs;
  if (resolver !== undefined) checkOpts.authority = resolver;
  if (opts.evidence !== undefined) checkOpts.evidence = opts.evidence;
  if (cfg.snapshot !== undefined) checkOpts.snapshot = { commit: cfg.snapshot.commit, ledgerHead: opts.ledgerHead ?? "0" };
  if (opts.ledger !== undefined) checkOpts.ledger = opts.ledger;
  if (opts.unchangedSince !== undefined) checkOpts.unchangedSince = opts.unchangedSince;
  const checked = await check(checkOpts);
  return { runs, checked };
}

export function fixtureRoot(spec: string): string {
  return dirname(resolve(spec));
}
