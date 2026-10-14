// Evaluate a project for its current snapshot: emit, run the sources, check, and decide the gate. Shared by csh check,
// csh gate, csh approve and csh run, so that every command evaluates a project the same way.
import { join } from "node:path";
import { cachingSolver, loadEvidenceStore, type Report, saveEvidenceStore, SolverCache, TOOL_VERSION } from "@csh/check";
import { gate, type GateDecision, type Mode, type Snapshot, snapshotDigest, type Waiver } from "@csh/gate";
import type { Module } from "@csh/kernel";
import { authoredByOf, type LedgerState, waiversFor } from "@csh/ledger";
import type { SolverPort } from "@csh/solver";
import { digestJson, stableJson } from "@csh/kernel";
import { checkAgainstModule, moduleOfManifest } from "@csh/component";
import { type Emission, emitSpec, evaluateSpec } from "./pipeline.ts";
import { CACHE_DIR, fragmentProvenance, ledgerOf, type Project, snapshotOf, specPathOf, unchangedSince } from "./project.ts";

export interface EvaluateOptions {
  /** A specification other than the one the project names (csh check <spec>). */
  spec?: string;
  solver: SolverPort;
  budgetMs?: number;
  /** Run without the solver cache. */
  noCache?: boolean;
  /** The specification as emitProject emitted it for these options, reused rather than emitted again. */
  emission?: Emission;
  /**
   * False reads no ledger and no signature, so every fragment is a candidate and GnuPG is not needed (csh analyse,
   * stage 55). The evidence store is not written either.
   */
  ledger?: false;
}

export type Evaluation =
  | { ok: true; report: Report; model: Module; ledger: LedgerState | undefined; snapshot: Snapshot }
  | { ok: false; message: string };

const formatProblems = (title: string, ps: { code: string; detail: string }[]) => `${title}:\n${ps.map((e) => `  ${e.code}: ${e.detail}`).join("\n")}\n`;

/** Why an emission cannot be evaluated: it failed, or the manifest does not match it. Undefined when it can. */
export function emissionProblem(e: Emission): string | undefined {
  if (!e.emitted.ok) return `emission failed:\n${e.emitted.errors.map((x) => `  ${x.code}${x.path !== undefined ? ` at ${x.path}` : ""}${x.line !== undefined ? `:${x.line}` : ""}: ${x.message}`).join("\n")}\n`;
  if (e.componentErrors !== undefined) return formatProblems("the component manifest does not match the specification", e.componentErrors);
  return undefined;
}

/**
 * The emission of a component with no specification: the model its manifest declares (Ingesting a codebase, stage
 * 21). Nothing is run to make it, so it cannot fail; its digest is the model's, as an emitted model's is.
 */
function manifestEmission(p: Project): Emission {
  const module = moduleOfManifest(p.component!.manifest);
  const emitted = { ok: true as const, module, digest: digestJson(module), canonical: stableJson(module), composition: { inherited: [], refinements: [] } };
  const errors = checkAgainstModule(p.component!.manifest, module, p.sourceRoot).errors;
  return errors.length > 0 ? { emitted, componentErrors: errors } : { emitted };
}

/** Emit the project's specification and check its manifest against it, exactly as evaluateProject begins. */
export function emitProject(p: Project, o: EvaluateOptions): Promise<Emission> {
  const budget = o.budgetMs ?? p.config.budgetMs;
  const spec = specPathOf(p, o.spec);
  if (spec === undefined) {
    if (p.component === undefined) throw new Error("no specification given and neither csh/component.json nor csh/config.json names one");
    return Promise.resolve(manifestEmission(p));
  }
  return emitSpec(spec, { root: p.root, solver: o.solver, config: budget !== undefined ? { budgetMs: budget } : {}, ...(p.lock !== undefined ? { lock: p.lock } : {}), ...(p.component !== undefined ? { component: p.component } : {}) });
}

export async function evaluateProject(p: Project, o: EvaluateOptions): Promise<Evaluation> {
  if (p.componentProblems.length > 0) return { ok: false, message: formatProblems("the component manifest cannot be used", p.componentProblems) };
  const spec = specPathOf(p, o.spec);
  const budget = o.budgetMs ?? p.config.budgetMs;
  const cacheFile = join(p.root, CACHE_DIR, "solver.json");
  const evidenceFile = join(p.root, CACHE_DIR, "evidence.json");
  const cache = o.noCache === true ? new SolverCache() : SolverCache.load(cacheFile);
  const evidence = loadEvidenceStore(evidenceFile);
  const ledger = o.ledger === false ? undefined : await ledgerOf(p, spec);
  const cfg = { ...(budget !== undefined ? { budgetMs: budget } : {}), ...(p.config.requirementIdPattern !== undefined ? { requirementIdPattern: p.config.requirementIdPattern } : {}) };
  const impl = unchangedSince(p);
  const emission = o.emission ?? (spec === undefined ? await emitProject(p, o) : undefined);
  const r = await evaluateSpec(
    spec ?? p.root,
    {
      root: p.root,
      sourceRoot: p.sourceRoot,
      ...(p.subject !== undefined ? { subjectCommit: p.subject.commit } : {}),
      solver: o.solver,
      config: cfg,
      ...(p.lock !== undefined ? { lock: p.lock } : {}),
      ...(ledger !== undefined ? { ledgerState: ledger } : {}),
      evidence,
      solverWrap: (s) => cachingSolver(s, cache),
      snapshot: { commit: p.commit, ledgerHead: String(ledger?.head ?? 0) },
      ...(impl !== undefined ? { unchangedSince: impl } : {}),
      ...(p.config.adapters !== undefined ? { adapters: p.config.adapters } : {}),
      ...(p.config.executions !== undefined ? { executions: p.config.executions } : {}),
      ...(p.component !== undefined ? { component: p.component } : {}),
      ...(o.noCache !== true ? { cacheDir: join(p.root, CACHE_DIR) } : {}),
    },
    emission,
  );
  const problem = emissionProblem(r);
  if (problem !== undefined) return { ok: false, message: problem };
  const report = r.checked!.report;
  const provenanceOf = o.ledger === false ? undefined : await fragmentProvenance(p, spec);
  if (provenanceOf !== undefined) for (const a of report.assessments ?? []) a.authoredBy = authoredByOf(provenanceOf(a.fragment, a.digest));
  // The module digest is known only after emission; the snapshot digest is filled in after it.
  const snapshot = snapshotOf(p, report.moduleDigest, ledger, o.solver.id, TOOL_VERSION);
  report.snapshot = { commit: p.commit, ledgerHead: String(ledger?.head ?? 0), digest: snapshotDigest(snapshot) };
  if (p.subject !== undefined) report.subject = { repo: p.subject.repo, commit: p.subject.commit };
  if (o.noCache !== true) cache.save(cacheFile);
  if (o.ledger !== false) saveEvidenceStore(evidenceFile, evidence);
  return { ok: true, report, model: r.checked!.prepared.module, ledger, snapshot };
}

/** Decide the gate for an evaluation: waivers come from the ledger, expiry from the snapshot commit's date. */
export function decideGate(p: Project, e: Extract<Evaluation, { ok: true }>, mode: Mode): GateDecision {
  const waivers: Waiver[] = [];
  for (const as of e.report.assessments ?? []) {
    for (const w of e.ledger === undefined ? [] : waiversFor(e.ledger, { name: as.fragment, digest: as.digest })) waivers.push({ seq: w.seq, fragment: w.fragment, digest: w.digest, scope: w.waiver!.scope, expires: w.waiver!.expires });
  }
  return gate({ report: e.report, snapshot: e.snapshot, mode, waivers, commitDate: p.commitDate });
}
