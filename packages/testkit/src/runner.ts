// The golden-fixture runner: each fixture's expected.json is an accepting or rejecting test
// (Semantic contract, section 7). It drives the real pipeline and compares observed with
// expected, collecting every mismatch rather than stopping at the first.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { type Assessment, type AuthorityResolver, cachingSolver, makeRefiner, type Finding, MemoryEvidenceStore, type Report, SolverCache } from "@csh/check";
import { emit, type Lock, readLock, typeCheck } from "@csh/emit";
import { acceptDecision, gate, type Snapshot, type Waiver } from "@csh/gate";
import { digestJson, digestOf, type Fragment, fragmentsOf, type Module, stableJson } from "@csh/kernel";
import { authorship, formatDecision, gitVcs, LEDGER_PATH, MAINTAINERS_PATH, readLedger, resolveAuthority, type Decision, type LedgerState, type Role } from "@csh/ledger";
import { printModule } from "@csh/print";
import type { SolverPort } from "@csh/solver";
import { createTestRepo, gpgAvailable, type TestRepo } from "./git.ts";
import { checkModule, evaluateSpec, type FixtureConfig, readConfig } from "@csh/run";
import { verifyCounterexample, verifyNoOutcome } from "./verify.ts";
import { type ComponentProblem, parseComponent } from "@csh/component";
import { buildA3, readJudgments, readStage, stageDir, stageIntegrity, type StageRecord } from "@csh/a3";

export interface FixtureResult {
  id: string;
  stage: number;
  section: string;
  pass: boolean;
  failures: string[];
  skipped?: string;
  /** Written before the code it tests: its stage is not built yet (Anchor, harnesses and A3, section 14.1). */
  pending?: string;
  ms: number;
}

/**
 * The last stage whose code exists. Fixtures for later stages are written first and reported as pending, never as
 * passing, until their stage raises this number.
 */
export const BUILT_THROUGH_STAGE = 14;

/** The stage a fixture belongs to, from its expected result. */
export function fixtureStage(fixturesDir: string, id: string): number {
  return (JSON.parse(readFileSync(join(fixturesDir, id, "expected.json"), "utf8")) as { stage: number }).stage;
}

// biome-ignore lint: expected.json is free-form test data.
type Exp = any;

export interface RunnerOptions {
  fixturesDir: string;
  solver: SolverPort;
  /** Scratch space inside the workspace, so that "csl" resolves from generated files. */
  workDir: string;
}

const SPEC_PATH = "spec/account.csl.ts";

export function listFixtures(dir: string): string[] {
  return readdirSync(dir).filter((d) => /^F\d\d$/.test(d)).sort();
}

/** Follow a one-line re-export to the file that holds the specification. */
export function resolveSpecSource(file: string): string {
  const text = readFileSync(file, "utf8");
  const m = /^export \{ default \} from "(.+)";\s*$/m.exec(text);
  if (m !== null && text.trim().split("\n").length === 1) return resolveSpecSource(resolve(dirname(file), m[1]!));
  return text;
}

function copyDir(from: string, to: string): void {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(from)) {
    const a = join(from, e);
    if (statSync(a).isDirectory()) copyDir(a, join(to, e));
    else copyFileSync(a, join(to, e));
  }
}

function lockOf(dir: string): Lock | undefined {
  const p = join(dir, "inputs", "lock.json");
  return existsSync(p) ? readLock(p) : undefined;
}

function standIn(dir: string): AuthorityResolver | undefined {
  const p = join(dir, "inputs", "authority.json");
  if (!existsSync(p)) return undefined;
  const a = JSON.parse(readFileSync(p, "utf8")) as { approve?: string | string[]; except?: string[] };
  return (f) => {
    const lifted = f.name.includes("/@");
    const listed = a.approve === "all" ? !lifted : Array.isArray(a.approve) && a.approve.includes(f.name);
    const excepted = (a.except ?? []).some((e) => f.name.includes(e));
    return { authority: listed && !excepted ? "approved" : "candidate" };
  };
}

export class FixtureRunner {
  private readonly o: RunnerOptions;
  private readonly emitCache = new Map<string, Promise<Awaited<ReturnType<typeof emit>>>>();
  constructor(o: RunnerOptions) {
    this.o = o;
    mkdirSync(o.workDir, { recursive: true });
  }

  async run(id: string): Promise<FixtureResult> {
    const t0 = performance.now();
    const dir = join(this.o.fixturesDir, id);
    const doc = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8")) as { stage: number; section: string; expect: Exp };
    const failures: string[] = [];
    const res: FixtureResult = { id, stage: doc.stage, section: doc.section, pass: false, failures, ms: 0 };
    if (doc.stage > BUILT_THROUGH_STAGE) {
      res.pending = `stage ${doc.stage} is not built yet`;
      return res;
    }
    try {
      const e = doc.expect;
      if ((e.git === true || e.steps !== undefined || e.a3?.authority !== undefined) && !gpgAvailable()) {
        res.skipped = "gpg is not installed";
      } else if (e.a3 !== undefined) await this.a3(dir, e.a3, failures);
      else if (e.git === true) await this.git(dir, e, failures);
      else if (e.steps !== undefined) await this.steps(dir, e, failures);
      else await this.single(dir, e, failures);
    } catch (err) {
      failures.push(`threw: ${(err as Error).stack ?? String(err)}`);
    }
    res.pass = failures.length === 0 && res.skipped === undefined;
    res.ms = Math.round(performance.now() - t0);
    return res;
  }

  private emitOpts(dir: string) {
    const o: Parameters<typeof emit>[1] & object = { root: dir, readable: [this.o.fixturesDir], refine: makeRefiner(this.o.solver) };
    const lock = lockOf(dir);
    if (lock !== undefined) o.lock = lock;
    return o;
  }

  // ---------------------------------------------------------------- single run

  private async single(dir: string, e: Exp, failures: string[]): Promise<void> {
    const spec = join(dir, "spec.csl.ts");
    if (e.compile !== undefined) this.compile(spec, e.compile, failures);
    if (e.compile?.ok === false) return;
    if (e.emit !== undefined || e.emitForced !== undefined) {
      const r = await emit(spec, this.emitOpts(dir));
      if (e.emit !== undefined) this.emitExpect("emit", r, e.emit, failures);
      if (e.emitForced !== undefined) {
        const forced = await emit(spec, { ...this.emitOpts(dir), unsafeAllowNondeterminism: true, skipTypeCheck: true });
        this.emitExpect("emitForced", forced, e.emitForced, failures);
      }
      if (e.emit?.ok === false) return;
    }
    const needsCheck = ["check", "assessments", "executions", "items", "noneSatisfied", "gate", "gateReplay", "composition", "absent", "present", "component"].some((k) => e[k] !== undefined);
    if (!needsCheck && e.roundTrip === undefined) return;
    const cfg = readConfig(dir);
    const authority = standIn(dir);
    const lock = lockOf(dir);
    // A component manifest in inputs/ is read as csh run reads csh/component.json (Anchor, harnesses and A3, section 2).
    const manifestFile = join(dir, "inputs", "component.json");
    const parsed = existsSync(manifestFile) ? parseComponent(readFileSync(manifestFile)) : undefined;
    const r = await evaluateSpec(spec, { root: dir, solver: this.o.solver, config: cfg, emit: { readable: [this.o.fixturesDir] }, ...(authority !== undefined ? { authority } : {}), ...(lock !== undefined ? { lock } : {}), ...(parsed?.component !== undefined ? { component: parsed.component } : {}) });
    if (!r.emitted.ok) {
      failures.push(`emission failed: ${JSON.stringify(r.emitted.errors)}`);
      return;
    }
    const componentErrors: ComponentProblem[] = [...(parsed?.problems ?? []), ...(r.componentErrors ?? [])];
    if (e.component !== undefined) {
      for (const x of e.component.errors ?? []) {
        if (!componentErrors.some((y) => y.code === x.code && (x.detailIncludes === undefined || y.detail.includes(x.detailIncludes)))) failures.push(`component error ${x.code} ${x.detailIncludes ?? ""} not reported; got ${JSON.stringify(componentErrors)}`);
      }
      if ((e.component.errors ?? []).length === 0 && componentErrors.length > 0) failures.push(`expected no component errors, got ${JSON.stringify(componentErrors)}`);
    }
    if (componentErrors.length > 0) {
      if (e.component === undefined) failures.push(`the component manifest was refused: ${JSON.stringify(componentErrors)}`);
      return;
    }
    if (e.roundTrip === true) await this.roundTrip(r.emitted.module, r.emitted.digest, failures);
    const checked = r.checked!;
    const report = checked.report;
    if (e.check !== undefined) await this.checkExpect(report, checked.prepared.module, checked.prepared.fragments, e.check, failures);
    if (e.assessments !== undefined) this.assessmentsExpect(report.assessments ?? [], e.assessments, failures);
    if (e.noneSatisfied === true && (report.assessments ?? []).some((a) => a.verdict === "satisfied")) failures.push("an obligation is satisfied, but none should be");
    for (const x of e.executions ?? []) {
      if (!report.executions.some((y) => y.witness === x.witness && y.localResult === x.localResult)) failures.push(`execution ${x.witness} ${x.localResult} not reported`);
    }
    for (const x of e.items ?? []) {
      if (!report.items.some((y) => y.source === x.source && y.id === x.id && (x.pattern === undefined || y.pattern === x.pattern))) failures.push(`item ${x.source}/${x.id} (${x.pattern}) not reported`);
    }
    if (e.composition !== undefined) {
      const c = report.composition;
      if (c === undefined) failures.push("composition: not reported");
      else {
        for (const u of e.composition.uses ?? []) if (!c.uses.some((x) => x.pack === u.pack && x.version === u.version)) failures.push(`composition: use of ${u.pack} ${u.version} not reported`);
        for (const n of e.composition.inheritedInclude ?? []) if (!c.inherited.includes(n)) failures.push(`composition: ${n} not inherited; got ${c.inherited.join(", ")}`);
        for (const n of e.composition.relaxedInclude ?? []) if (!c.relaxed.some((x) => x.obligation === n)) failures.push(`composition: ${n} not relaxed`);
        for (const x of e.composition.refinements ?? []) if (!c.refinements.some((y) => y.obligation === x.obligation && y.result === x.result)) failures.push(`composition: refinement ${x.obligation} ${x.result} not reported; got ${JSON.stringify(c.refinements)}`);
      }
    }
    for (const n of e.absent ?? []) if (checked.prepared.fragments.some((f) => f.name === n)) failures.push(`${n} should not be in the model`);
    for (const n of e.present ?? []) if (!checked.prepared.fragments.some((f) => f.name === n)) failures.push(`${n} should be in the model; got ${checked.prepared.fragments.map((f) => f.name).join(", ")}`);
    if (e.gate !== undefined || e.gateReplay !== undefined) this.gateExpect(dir, cfg, report, checked.prepared.fragments, e, failures);
  }

  private compile(spec: string, exp: { ok: boolean; rule?: string; markedLine?: boolean }, failures: string[]): void {
    const diags = typeCheck(spec);
    if (exp.ok) {
      if (diags.length > 0) failures.push(`compile: expected no errors, got ${diags.map((d) => `${d.line}: ${d.message}`).join(" | ")}`);
      return;
    }
    if (diags.length === 0) {
      failures.push(`compile: expected rejection (${exp.rule}), but it compiled`);
      return;
    }
    if (exp.markedLine === true) {
      const lines = readFileSync(spec, "utf8").split("\n");
      const marked = lines.findIndex((l) => l.includes("// expect-error:")) + 1;
      const rule = /expect-error:\s*(S\d)/.exec(lines[marked - 1] ?? "")?.[1];
      if (rule !== exp.rule) failures.push(`compile: marker names ${rule}, expected ${exp.rule}`);
      if (!diags.some((d) => d.line === marked)) failures.push(`compile: no error on the marked line ${marked}; errors at ${diags.map((d) => d.line).join(", ")}`);
    }
  }

  private emitExpect(what: string, r: Awaited<ReturnType<typeof emit>>, exp: { ok: boolean; rule?: string; error?: string }, failures: string[]): void {
    if (exp.ok) {
      if (!r.ok) failures.push(`${what}: expected success, got ${JSON.stringify(r.errors)}`);
      return;
    }
    if (r.ok) {
      failures.push(`${what}: expected ${exp.rule ?? exp.error}, but emission succeeded`);
      return;
    }
    const want = exp.rule ?? exp.error;
    if (!r.errors.some((x) => x.code === want)) failures.push(`${what}: expected ${want}, got ${r.errors.map((x) => x.code).join(", ")}`);
  }

  private async roundTrip(m: Module, digest: string, failures: string[]): Promise<void> {
    const file = join(this.o.workDir, `roundtrip-${digest.slice(7, 19)}.csl.ts`);
    writeFileSync(file, printModule(m));
    const r = await emit(file, { root: this.o.workDir });
    if (!r.ok) failures.push(`roundTrip: printed module does not emit: ${JSON.stringify(r.errors)}`);
    else if (r.digest !== digest) failures.push(`roundTrip: digest ${r.digest} differs from ${digest}`);
    rmSync(file, { force: true });
  }

  // ---------------------------------------------------------------- report matching

  private async checkExpect(report: Report, m: Module, fragments: Fragment[], c: Exp, failures: string[]): Promise<void> {
    const findings = report.findings;
    const used = new Set<string>();
    for (const x of c.findings ?? []) {
      const want = [...x.members].sort().join(",");
      const f = findings.find((y) => !used.has(y.id) && y.kind === x.kind && y.members.map((mm) => mm.fragment).sort().join(",") === want);
      if (f === undefined) {
        failures.push(`finding ${x.kind} {${want}} not found; got ${findings.map((y) => `${y.kind} {${y.members.map((mm) => mm.fragment).join(",")}}`).join("; ") || "none"}`);
        continue;
      }
      used.add(f.id);
      await this.findingDetails(f, x, m, fragments, failures);
    }
    if (c.findingsExact === true && findings.length !== (c.findings ?? []).length) {
      failures.push(`expected exactly ${(c.findings ?? []).length} findings, got ${findings.length}: ${findings.map((y) => `${y.kind} {${y.members.map((mm) => mm.fragment).join(",")}}`).join("; ")}`);
    }
    if (c.findingsNonEmpty === true && findings.length === 0) failures.push("expected findings, got none");
    if (c.allFindingsUnknown !== undefined) {
      const bad = findings.filter((f) => f.kind !== "unknown" || f.reason !== c.allFindingsUnknown);
      if (bad.length > 0) failures.push(`expected every finding unknown (${c.allFindingsUnknown}); got ${bad.map((f) => `${f.kind} ${f.reason ?? ""}`).join(", ")}`);
    }
    for (const g of c.gaps ?? []) {
      const hit = report.gapView.gaps.some((y) => y.kind === g.kind && (g.subject === undefined || y.subject === g.subject) && (g.detailIncludes === undefined || (y.detail ?? "").includes(g.detailIncludes)));
      if (!hit) failures.push(`gap ${g.kind} ${g.subject ?? ""} ${g.detailIncludes ?? ""} not found; got ${report.gapView.gaps.map((y) => `${y.kind} ${y.subject} (${y.detail ?? ""})`).join("; ")}`);
    }
    for (const g of c.gapsExclude ?? []) {
      const hit = report.gapView.gaps.filter((y) => y.kind === g.kind && (g.subject === undefined || y.subject === g.subject));
      if (hit.length > 0) failures.push(`gap ${g.kind} ${g.subject ?? ""} should be absent; got ${hit.map((y) => `${y.subject} (${y.detail ?? ""})`).join("; ")}`);
    }
    for (const n of c.notComparable ?? []) {
      if (!report.notComparable.some((y) => y.fragment === n.fragment && y.source === n.source && y.reason === n.reason)) failures.push(`not-comparable ${n.fragment} ${n.reason} not reported; got ${JSON.stringify(report.notComparable)}`);
    }
    for (const cell of c.cells ?? []) {
      const row = report.gapView.rows.find((r) => r.subject === cell.subject);
      const got = row?.cells[cell.source];
      if (got !== cell.value) failures.push(`cell ${cell.subject} / ${cell.source} is ${got}, expected ${cell.value}`);
    }
    for (const u of c.unliftable ?? []) {
      if (!report.unliftable.some((y) => y.source === u.source && y.reason === u.reason && (u.spanIncludes === undefined || y.span.includes(u.spanIncludes)))) failures.push(`unliftable ${u.source} ${u.reason} ${u.spanIncludes ?? ""} not reported; got ${JSON.stringify(report.unliftable)}`);
    }
    for (const er of c.errors ?? []) {
      if (!report.errors.some((y) => y.code === er.code && (er.detailIncludes === undefined || y.detail.includes(er.detailIncludes)))) failures.push(`error ${er.code} ${er.detailIncludes ?? ""} not reported; got ${JSON.stringify(report.errors)}`);
    }
  }

  private async findingDetails(f: Finding, x: Exp, m: Module, fragments: Fragment[], failures: string[]): Promise<void> {
    const label = `${f.kind} {${f.members.map((mm) => mm.fragment).join(",")}}`;
    if (x.scope !== undefined && f.scope !== x.scope) failures.push(`${label}: scope ${f.scope}, expected ${x.scope}`);
    if (x.crossSource !== undefined && f.crossSource !== x.crossSource) failures.push(`${label}: crossSource ${f.crossSource}, expected ${x.crossSource}`);
    if (x.inputs !== undefined && f.inputs !== x.inputs) failures.push(`${label}: inputs ${f.inputs ?? "none"}, expected ${x.inputs}`);
    if (x.sources !== undefined) {
      const got = [...new Set(f.members.map((mm) => mm.source))].sort().join(",");
      if (got !== [...x.sources].sort().join(",")) failures.push(`${label}: sources ${got}, expected ${x.sources.join(",")}`);
    }
    for (const t of x.collisionTermsInclude ?? []) if (!f.collisionTerms.includes(t)) failures.push(`${label}: collision term ${t} missing; got ${f.collisionTerms.join(", ")}`);
    for (const t of x.context ?? []) if (!f.context.includes(t)) failures.push(`${label}: context ${t} missing; got ${f.context.join(", ")}`);
    if (x.counterexample === true) {
      const why = verifyCounterexample(f, m, fragments);
      if (why !== undefined) failures.push(`${label}: counterexample does not verify: ${why}`);
    }
    if (x.noOutcomeWitness === true) {
      const why = await verifyNoOutcome(f, m, fragments, this.o.solver);
      if (why !== undefined) failures.push(`${label}: reported input does not verify: ${why}`);
    }
  }

  private assessmentsExpect(got: Assessment[], exp: Exp[], failures: string[], label = "assessment"): void {
    for (const x of exp) {
      const a = got.find((y) => y.fragment === x.fragment);
      if (a === undefined) {
        failures.push(`${label} for ${x.fragment} missing`);
        continue;
      }
      const short = x.fragment.split("/").pop();
      for (const k of ["authority", "verdict", "scope", "applicability"] as const) {
        if (x[k] !== undefined && a[k] !== x[k]) failures.push(`${short}: ${k} ${a[k]}, expected ${x[k]} (reasons: ${a.reasons.join("; ")})`);
      }
      if (x.evidenceApplicability !== undefined) {
        if (a.evidence.length === 0) failures.push(`${short}: no evidence, expected ${x.evidenceApplicability}`);
        for (const ev of a.evidence) if (ev.applicability !== x.evidenceApplicability) failures.push(`${short}: evidence ${ev.witness} is ${ev.applicability}, expected ${x.evidenceApplicability}`);
      }
      for (const r of x.reasonsInclude ?? []) if (!a.reasons.some((y) => y.includes(r))) failures.push(`${short}: reason ${r} missing; got ${a.reasons.join("; ")}`);
    }
  }

  // ---------------------------------------------------------------- gate

  private gateExpect(dir: string, cfg: FixtureConfig, report: Report, fragments: Fragment[], e: Exp, failures: string[]): void {
    const auth = JSON.parse(readFileSync(join(dir, "inputs", "authority.json"), "utf8")) as { waive?: { fragment: string; scope: string; expires: string }[] };
    // Stand-in waivers, numbered as ledger entries would be.
    const waivers: Waiver[] = (auth.waive ?? []).map((w, i) => ({ seq: i + 1, fragment: w.fragment, digest: fragments.find((f) => f.name === w.fragment)?.digest ?? "", scope: w.scope, expires: w.expires }));
    const snapshot: Snapshot = { commit: cfg.snapshot?.commit ?? "unknown", moduleDigest: report.moduleDigest, ledgerHead: 0, configDigest: digestJson(cfg), lockDigest: digestJson(null), tool: { version: report.tool.version, solver: report.tool.solver } };
    for (const g of e.gate ?? []) {
      const d = gate({ report, snapshot, mode: g.mode, waivers, commitDate: g.commitDate });
      if (g.overall !== undefined && d.overall !== g.overall) failures.push(`gate at ${g.commitDate}: overall ${d.overall}, expected ${g.overall}`);
      for (const o of g.obligations ?? []) {
        const row = d.obligations.find((y) => y.fragment === o.fragment);
        if (row === undefined) failures.push(`gate at ${g.commitDate}: no row for ${o.fragment}`);
        else {
          if (o.verdict !== undefined && row.verdict !== o.verdict) failures.push(`gate at ${g.commitDate}: ${o.fragment} verdict ${row.verdict}, expected ${o.verdict}`);
          if (o.disposition !== undefined && row.disposition !== o.disposition) failures.push(`gate at ${g.commitDate}: ${o.fragment} disposition ${row.disposition}, expected ${o.disposition} (${row.because})`);
        }
      }
    }
    if (e.gateReplay !== undefined) {
      const d = gate({ report, snapshot, mode: "enforcing", waivers, commitDate: cfg.snapshot?.commitDate ?? "" });
      if (acceptDecision(d, snapshot).accepted !== true) failures.push("gateReplay: decision refused for its own snapshot");
      const other = acceptDecision(d, { ...snapshot, commit: e.gateReplay.otherCommit });
      if ((other.accepted === false) !== e.gateReplay.refused) failures.push(`gateReplay: refused ${!other.accepted}, expected ${e.gateReplay.refused}`);
    }
  }

  // ---------------------------------------------------------------- A3 fixtures

  /**
   * An A3 from inputs/component.json and inputs/csh/a3/<slug>/: problems from the builder, stage integrity from verify
   * (no commit exists to re-run, so an intact stage is unverifiable), and authority through a real, signed ledger.
   */
  private async a3(dir: string, x: Exp, failures: string[]): Promise<void> {
    const inputs = join(dir, "inputs");
    const slug = readdirSync(join(inputs, "csh", "a3"))[0]!;
    const loaded = parseComponent(readFileSync(join(inputs, "component.json")));
    if (loaded.component === undefined) throw new Error(`fixture manifest unusable: ${JSON.stringify(loaded.problems)}`);
    const manifest = loaded.component.manifest;
    const read = readJudgments(inputs, slug);
    if (read === undefined || read.problems.length > 0) throw new Error(`fixture judgments unusable: ${JSON.stringify(read?.problems)}`);
    const stages = read.judgments.stages.map((s) => readStage(stageDir(inputs, slug, s.id), s.id)).filter((s): s is StageRecord => s !== undefined);
    if (x.problems !== undefined) {
      const model = buildA3({ slug, judgments: read.judgments, judgmentsDigest: digestOf(read.bytes), component: { name: manifest.name, practices: manifest.practices }, stages, authority: { authority: "candidate" } });
      for (const want of x.problems as { kind: string; subject?: string; stage?: string }[]) {
        if (!model.problems.some((p) => p.kind === want.kind && (want.subject === undefined || p.subject.includes(want.subject)) && (want.stage === undefined || p.stage === want.stage))) {
          failures.push(`a3 problem ${JSON.stringify(want)} not reported; got ${JSON.stringify(model.problems)}`);
        }
      }
    }
    if (x.verify !== undefined) {
      const got = stages.map((s) => ({ stage: s.id, problem: stageIntegrity(s)?.problem ?? "stage-unverifiable" }));
      for (const want of x.verify as { stage: string; problem: string }[]) {
        if (!got.some((g) => g.stage === want.stage && g.problem === want.problem)) failures.push(`verify ${want.stage}: expected ${want.problem}, got ${JSON.stringify(got)}`);
      }
    }
    if (x.authority !== undefined) await this.a3Authority(inputs, slug, manifest.name, x.authority, failures);
  }

  /** Approve an A3's judgments with a test-only key, then edit them unsigned (section 5.6). */
  private async a3Authority(inputs: string, slug: string, component: string, want: { after: string; authority: string; selfApproved?: boolean }[], failures: string[]): Promise<void> {
    const repo = createTestRepo(join(this.o.workDir, "repos"), ["Owner"]);
    try {
      const file = `csh/a3/${slug}/judgments.json`;
      const name = `${component}/#a3/${slug}`;
      repo.write(MAINTAINERS_PATH, `${JSON.stringify(repo.maintainers(["Owner"], { Owner: { kind: "person", roles: ["intent-owner", "domain-reviewer"] } }), null, 2)}\n`);
      repo.commit("Maintainers", "Owner");
      const original = readFileSync(join(inputs, "csh", "a3", slug, "judgments.json"), "utf8");
      repo.write(file, original);
      repo.commit("Judgments", null);
      const d: Decision = { schema: "csh-decision/v1", seq: 1, kind: "approve", fragment: name, digest: digestOf(original), rationale: "the sheet's root causes are right", actor: "Owner", selfApproved: true };
      repo.write(LEDGER_PATH, `${formatDecision(d)}\n`);
      repo.commit("Approve the judgments", "Owner");
      const check = (after: string) => {
        const text = readFileSync(join(repo.dir, file), "utf8");
        const a = resolveAuthority(readLedger(gitVcs(repo.dir, { env: repo.env })), { name, digest: digestOf(text), cites: [] });
        for (const w of want.filter((x) => x.after === after)) {
          if (a.authority !== w.authority) failures.push(`after ${after}: authority ${a.authority}, expected ${w.authority}`);
          if (w.selfApproved !== undefined && a.selfApproved !== w.selfApproved) failures.push(`after ${after}: selfApproved ${String(a.selfApproved)}, expected ${String(w.selfApproved)}`);
        }
      };
      check("approve");
      repo.write(file, original.replace('"problem": "', '"problem": "Edited. '));
      repo.commit("Edit the judgments", null);
      check("edit");
    } finally {
      repo.dispose();
    }
  }

  // ---------------------------------------------------------------- ledger scenarios

  private emitInRepo(repo: TestRepo) {
    const file = join(repo.dir, SPEC_PATH);
    const key = readFileSync(file, "utf8");
    let p = this.emitCache.get(key);
    if (p === undefined) {
      p = emit(file, { root: repo.dir, skipTypeCheck: true });
      this.emitCache.set(key, p);
    }
    return p;
  }

  /** Fragment digests at a commit, by emitting the specification as it stood there. */
  private digestsAt(repo: TestRepo): (commit: string) => Promise<ReadonlyMap<string, string> | undefined> {
    return async (commit) => {
      let text: string;
      try {
        text = repo.git("show", `${commit}:${SPEC_PATH}`);
      } catch {
        return undefined;
      }
      let p = this.emitCache.get(text);
      if (p === undefined) {
        const file = join(this.o.workDir, `authorship-${digestJson(text).slice(7, 23)}.csl.ts`);
        writeFileSync(file, text);
        p = emit(file, { root: this.o.workDir, skipTypeCheck: true });
        this.emitCache.set(text, p);
      }
      const r = await p;
      return r.ok ? new Map(fragmentsOf(r.module).map((f) => [f.name, f.digest])) : undefined;
    };
  }

  /** Read the ledger, with authorship computed from the specification's history. */
  private async ledgerOf(repo: TestRepo): Promise<LedgerState> {
    const vcs = gitVcs(repo.dir, { env: repo.env });
    // authorship() is synchronous; precompute digests for every commit that touched the specification.
    const digests = new Map<string, ReadonlyMap<string, string> | undefined>();
    for (const c of vcs.commitsTouching(SPEC_PATH)) digests.set(c, await this.digestsAt(repo)(c));
    const authorOf = authorship(vcs, [SPEC_PATH], (c) => digests.get(c));
    return readLedger(vcs, { authorOf });
  }

  private authorityExpect(label: string, state: LedgerState, fragments: Fragment[], exp: Exp[], failures: string[]): void {
    for (const x of exp) {
      const f = fragments.find((y) => y.name === x.fragment);
      if (f === undefined) {
        failures.push(`${label}: fragment ${x.fragment} not in the model`);
        continue;
      }
      const a = resolveAuthority(state, f);
      const short = x.fragment.split("/").pop();
      for (const k of ["authority", "reason", "selfApproved", "needsReview"] as const) {
        if (x[k] !== undefined && a[k] !== x[k]) failures.push(`${label}: ${short} ${k} ${String(a[k])}, expected ${String(x[k])}`);
      }
    }
  }

  private async git(dir: string, e: Exp, failures: string[]): Promise<void> {
    const sc = JSON.parse(readFileSync(join(dir, "inputs", "scenario.json"), "utf8")) as {
      identities: Record<string, { kind: "person" | "agent"; roles: Role[] }>;
      commits: { signer: string | null; message: string; maintainers?: string[]; spec?: boolean; ledger?: Partial<Decision>[]; touch?: string; rewriteFirstRationale?: string; checkpoint?: string }[];
    };
    const repo = createTestRepo(join(this.o.workDir, "repos"), Object.keys(sc.identities));
    try {
      const ledgerLines: string[] = [];
      let persons = 0;
      for (const c of sc.commits) {
        if (c.maintainers !== undefined) {
          repo.write(MAINTAINERS_PATH, `${JSON.stringify(repo.maintainers(c.maintainers, sc.identities), null, 2)}\n`);
          persons = c.maintainers.filter((n) => sc.identities[n]!.kind === "person").length;
        }
        if (c.spec === true) repo.write(SPEC_PATH, resolveSpecSource(join(dir, "spec.csl.ts")));
        if (c.touch !== undefined) repo.write(c.touch, `touched by ${c.message}\n`);
        if (c.rewriteFirstRationale !== undefined && ledgerLines.length > 0) {
          const first = JSON.parse(ledgerLines[0]!) as Decision;
          ledgerLines[0] = formatDecision({ ...first, rationale: c.rewriteFirstRationale });
        }
        if (c.ledger !== undefined) {
          const r = await this.emitInRepo(repo);
          if (!r.ok) throw new Error(`scenario spec does not emit: ${JSON.stringify(r.errors)}`);
          const frags = fragmentsOf(r.module);
          for (const entry of c.ledger) {
            const f = frags.find((x) => x.name === entry.fragment);
            const d: Decision = {
              schema: "csh-decision/v1",
              seq: ledgerLines.length + 1,
              kind: entry.kind ?? "approve",
              fragment: entry.fragment!,
              digest: f?.digest ?? "sha256:missing",
              rationale: entry.rationale ?? `${entry.kind ?? "approve"} in fixture scenario`,
              actor: entry.actor!,
              selfApproved: entry.selfApproved ?? persons === 1,
            };
            if (entry.refers !== undefined) d.refers = entry.refers;
            ledgerLines.push(formatDecision(d));
          }
        }
        if (c.ledger !== undefined || c.rewriteFirstRationale !== undefined) repo.write(LEDGER_PATH, ledgerLines.map((l) => `${l}\n`).join(""));
        repo.commit(c.message, c.signer);
        if (c.checkpoint !== undefined && e[c.checkpoint] !== undefined) {
          const r = await this.emitInRepo(repo);
          if (!r.ok) throw new Error("scenario spec does not emit");
          this.authorityExpect(c.checkpoint, await this.ledgerOf(repo), fragmentsOf(r.module), e[c.checkpoint], failures);
        }
      }
      const state = await this.ledgerOf(repo);
      for (const x of e.invalidEntries ?? []) {
        if (!state.invalid.some((y) => y.seq === x.seq && y.reason === x.reason)) failures.push(`invalid entry seq ${x.seq} ${x.reason} not reported; got ${JSON.stringify(state.invalid)}`);
      }
      if (Array.isArray(e.invalidEntries) && e.invalidEntries.length === 0 && state.invalid.length > 0) failures.push(`expected no invalid entries, got ${JSON.stringify(state.invalid)}`);
      if (e.authority !== undefined) {
        const r = await this.emitInRepo(repo);
        if (!r.ok) throw new Error("scenario spec does not emit");
        this.authorityExpect("authority", state, fragmentsOf(r.module), e.authority, failures);
      }
    } finally {
      repo.dispose();
    }
  }

  /** Two-step scenarios: approve everything after step one, change something, evaluate again. */
  private async steps(dir: string, e: Exp, failures: string[]): Promise<void> {
    const sc = JSON.parse(readFileSync(join(dir, "inputs", "scenario.json"), "utf8")) as { steps: { spec: string; approve?: string; replace?: Record<string, string> }[] };
    const cfg = readConfig(dir);
    const repo = createTestRepo(join(this.o.workDir, "repos"), ["owner"]);
    const store = new MemoryEvidenceStore();
    const cache = new SolverCache();
    try {
      repo.write(MAINTAINERS_PATH, `${JSON.stringify(repo.maintainers(["owner"], { owner: { kind: "person", roles: ["intent-owner", "domain-reviewer"] } }), null, 2)}\n`);
      copyDir(join(dir, "inputs"), join(repo.dir, "inputs"));
      const reports: { digest: string; report: Report; fragments: Fragment[]; state: LedgerState }[] = [];
      let afterStep1: { store: MemoryEvidenceStore; cache: SolverCache } | undefined;
      for (const [i, step] of sc.steps.entries()) {
        repo.write(SPEC_PATH, resolveSpecSource(join(dir, step.spec)));
        for (const [target, from] of Object.entries(step.replace ?? {})) copyFileSync(join(dir, from), join(repo.dir, target));
        repo.commit(`step ${i + 1}`, "owner");
        const emitted = await this.emitInRepo(repo);
        if (!emitted.ok) throw new Error(`step ${i + 1} does not emit: ${JSON.stringify(emitted.errors)}`);
        if (step.approve === "all") {
          // A first look (no evidence recorded) to learn the fragments and cited items.
          const first = await checkModule(emitted.module, emitted.digest, { root: repo.dir, solver: this.o.solver, config: cfg, ledgerState: await this.ledgerOf(repo), evidence: new MemoryEvidenceStore() });
          const items = new Map(first.checked.prepared.items.map((it) => [`${it.source}/${it.id}`, it.textDigest]));
          const lines = existsSync(join(repo.dir, LEDGER_PATH)) ? readFileSync(join(repo.dir, LEDGER_PATH), "utf8") : "";
          let seq = lines.split("\n").filter((l) => l !== "").length;
          const out: string[] = [];
          for (const f of first.checked.prepared.fragments.filter((x) => !x.lifted)) {
            const d: Decision = { schema: "csh-decision/v1", seq: ++seq, kind: "approve", fragment: f.name, digest: f.digest, rationale: "approved in fixture scenario", actor: "owner", selfApproved: true };
            if (f.cites.length > 0) d.cited = f.cites.map((c) => ({ source: c.source, id: c.id, textDigest: items.get(`${c.source}/${c.id}`) ?? "missing" }));
            out.push(formatDecision(d));
          }
          repo.write(LEDGER_PATH, `${lines}${out.map((l) => `${l}\n`).join("")}`);
          repo.commit(`approve step ${i + 1}`, "owner");
        }
        const state = await this.ledgerOf(repo);
        const isLast = i === sc.steps.length - 1;
        if (isLast && e.incrementalEqualsFull === true && afterStep1 !== undefined) {
          const inc = await checkModule(emitted.module, emitted.digest, { root: repo.dir, solver: this.o.solver, config: cfg, ledgerState: state, evidence: afterStep1.store.clone(), solverWrap: (s) => cachingSolver(s, afterStep1!.cache) });
          const full = await checkModule(emitted.module, emitted.digest, { root: repo.dir, solver: this.o.solver, config: cfg, ledgerState: state, evidence: afterStep1.store.clone() });
          const a = stableJson(inc.checked.report);
          const b = stableJson(full.checked.report);
          if (a !== b) failures.push(`incremental and full reports differ:\n${diffLines(a, b)}`);
          if (afterStep1.cache.hits === 0) failures.push("the incremental run reused no cached solver result");
        }
        const r = await checkModule(emitted.module, emitted.digest, { root: repo.dir, solver: this.o.solver, config: cfg, ledgerState: state, evidence: store, solverWrap: (s) => cachingSolver(s, cache) });
        reports.push({ digest: emitted.digest, report: r.checked.report, fragments: r.checked.prepared.fragments, state });
        if (i === 0) afterStep1 = { store: store.clone(), cache };
      }
      const last = reports[reports.length - 1]!;
      if (e.sameDigest === true && new Set(reports.map((r) => r.digest)).size !== 1) failures.push(`digests differ: ${reports.map((r) => r.digest).join(" vs ")}`);
      if (e.allApproved === true) {
        const notApproved = last.fragments.filter((f) => !f.lifted && resolveAuthority(last.state, f).authority !== "approved");
        if (notApproved.length > 0) failures.push(`not approved after the change: ${notApproved.map((f) => f.name).join(", ")}`);
      }
      if (e.noneStale === true) {
        const stale = (last.report.assessments ?? []).filter((a) => a.applicability === "stale" || a.evidence.some((x) => x.applicability === "stale"));
        if (stale.length > 0) failures.push(`stale after the change: ${stale.map((a) => a.fragment).join(", ")}`);
      }
      if (e.assessments !== undefined) this.assessmentsExpect(last.report.assessments ?? [], e.assessments, failures);
      if (e.authority !== undefined) {
        // Authority in the report includes source-text checks; read it from the assessments where present.
        for (const x of e.authority) {
          const a = last.report.assessments?.find((y) => y.fragment === x.fragment);
          const f = last.fragments.find((y) => y.name === x.fragment);
          const got = a !== undefined ? { authority: a.authority, reason: a.authorityReason } : f !== undefined ? resolveAuthority(last.state, f) : undefined;
          if (got === undefined) failures.push(`authority: ${x.fragment} not in the model`);
          else {
            if (got.authority !== x.authority) failures.push(`authority: ${x.fragment} is ${got.authority}, expected ${x.authority}`);
            if (x.reason !== undefined && got.reason !== x.reason) failures.push(`authority: ${x.fragment} reason ${String(got.reason)}, expected ${x.reason}`);
          }
        }
      }
    } finally {
      repo.dispose();
    }
  }
}

function diffLines(a: string, b: string): string {
  const x = a.split("\n");
  const y = b.split("\n");
  const out: string[] = [];
  for (let i = 0; i < Math.max(x.length, y.length) && out.length < 20; i++) if (x[i] !== y[i]) out.push(`  ${i + 1}: ${x[i] ?? ""}\n  ${i + 1}: ${y[i] ?? ""}`);
  return out.join("\n");
}

export function summarise(results: FixtureResult[]): string {
  const lines = results.map((r) => `${r.pass ? "pass" : r.pending !== undefined ? "pending" : r.skipped !== undefined ? "skip" : "FAIL"}  ${r.id}  stage ${r.stage}  ${r.ms} ms${r.skipped !== undefined ? `  (${r.skipped})` : ""}${r.pending !== undefined ? `  (${r.pending})` : ""}${r.failures.map((f) => `\n      ${f}`).join("")}`);
  const pass = results.filter((r) => r.pass).length;
  const pending = results.filter((r) => r.pending !== undefined).length;
  return `${lines.join("\n")}\n${pass} of ${results.length} fixtures pass${pending > 0 ? `, ${pending} pending` : ""}\n`;
}

export function relativeTo(root: string, p: string): string {
  return relative(root, p);
}
