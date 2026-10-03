// csh run (Anchor, harnesses and A3, section 4): one evaluation of one component at one snapshot. Each practice with
// a harness runs its own test command, which records witnesses; then the pipeline checks and the gate decides; then
// the run record is stored under .csh-cache/runs/<snapshot digest>/. A harness's exit code is stored as an execution
// fact and never enters a verdict (P2).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { type ComponentManifest, DEFAULT_EXECUTIONS } from "@csh/component";
import type { Report } from "@csh/check";
import { formatDecision, type GateDecision, type Mode, type Snapshot } from "@csh/gate";
import { digestOf, stableJson } from "@csh/kernel";
import type { SolverPort } from "@csh/solver";
import { decideGate, evaluateProject } from "./evaluate.ts";
import { CACHE_DIR, loadProject, MODEL_PATH, type Project, REPORT_PATH } from "./project.ts";

export const RUNS_DIR = `${CACHE_DIR}/runs`;
export const GATE_PATH = "reports/csh-gate.json";

export interface HarnessRecord {
  practice: string;
  argv: string[];
  /** The command's exit code; null when it ended by a signal or could not start. */
  exitCode: number | null;
  /** Lines in the witness file after the run. */
  witnesses: number;
  /** Lines in the executions file after the run. */
  executions: number;
  /** The harness runs with the project's own permissions, exactly as running the tests by hand would. */
  sandbox: "none";
  /** Why the command could not start, when it could not. */
  error?: string;
}

export interface RunRecord {
  schema: "csh-run/v1";
  component: string;
  /** As for the gate, with componentDigest. */
  snapshot: Snapshot;
  snapshotDigest: string;
  harnesses: HarnessRecord[];
  /** Digests of report.json and gate.json as stored beside this record, byte for byte. */
  reportDigest: string;
  gateDigest: string;
}

export interface RunOptions {
  /** The component root (the directory that holds csh/component.json). */
  root: string;
  solver: SolverPort;
  mode?: Mode;
  budgetMs?: number;
  noCache?: boolean;
  /** Where harness output goes; the default discards it. */
  harnessOutput?: (chunk: string) => void;
}

export type RunResult =
  | { ok: true; record: RunRecord; report: Report; decision: GateDecision; dir: string }
  | { ok: false; code: string; message: string };

const countLines = (file: string) => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter((l) => l.trim() !== "").length : 0);

function exec(argv: string[], cwd: string, env: NodeJS.ProcessEnv, out: (s: string) => void): Promise<{ exitCode: number | null; error?: string }> {
  return new Promise((done) => {
    const child = spawn(argv[0]!, argv.slice(1), { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d: Buffer) => out(d.toString()));
    child.stderr.on("data", (d: Buffer) => out(d.toString()));
    child.on("error", (e) => done({ exitCode: null, error: e.message }));
    child.on("close", (code) => done({ exitCode: code }));
  });
}

/** Run each practice's harness. Old witness and execution files are removed first, so a run never reads stale ones. */
export async function runHarnesses(p: Project, manifest: ComponentManifest, out: (s: string) => void): Promise<HarnessRecord[]> {
  const records: HarnessRecord[] = [];
  for (const practice of manifest.practices) {
    const h = practice.harness;
    if (h === undefined) continue;
    const witnesses = resolve(p.root, h.witnesses);
    const executions = resolve(p.root, h.executions ?? DEFAULT_EXECUTIONS);
    for (const f of [witnesses, executions]) {
      rmSync(f, { force: true });
      mkdirSync(dirname(f), { recursive: true });
    }
    const env = { ...process.env, CSH_COMMIT: p.commit, CSH_WITNESS_FILE: witnesses, CSH_EXECUTIONS_FILE: executions };
    const r = await exec(h.run, p.root, env, out);
    const rec: HarnessRecord = { practice: practice.id, argv: [...h.run], exitCode: r.exitCode, witnesses: countLines(witnesses), executions: countLines(executions), sandbox: "none" };
    if (r.error !== undefined) rec.error = r.error;
    records.push(rec);
  }
  return records;
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** The directory a run is stored in: the same snapshot always gives the same directory. */
export function runDir(storeRoot: string, snapshotDigest: string): string {
  return join(storeRoot, RUNS_DIR, snapshotDigest.replace(/^sha256:/, ""));
}

/**
 * Run the component at the root's current state. `storeRoot` is where the run record goes; it differs from the root
 * only for a run at a past commit, whose worktree is thrown away afterwards.
 */
export async function runComponent(o: RunOptions & { storeRoot?: string }): Promise<RunResult> {
  const p = loadProject(o.root, o.root);
  if (p.component === undefined && p.componentProblems.length === 0) return { ok: false, code: "no-component", message: `no csh/component.json under ${p.root}; csh run evaluates a component (csh init writes one)` };
  if (p.componentProblems.length > 0 || p.component === undefined) return { ok: false, code: "component-unusable", message: `the component manifest cannot be used:\n${p.componentProblems.map((e) => `  ${e.code}: ${e.detail}`).join("\n")}` };
  const harnesses = await runHarnesses(p, p.component.manifest, o.harnessOutput ?? (() => undefined));
  const e = await evaluateProject(p, { solver: o.solver, ...(o.budgetMs !== undefined ? { budgetMs: o.budgetMs } : {}), ...(o.noCache === true ? { noCache: true } : {}) });
  if (!e.ok) return { ok: false, code: "evaluation-failed", message: e.message };
  const mode = o.mode ?? p.config.mode ?? "advisory";
  const decision = decideGate(p, e, mode);
  const reportText = stableJson(e.report);
  const gateText = formatDecision(decision);
  const record: RunRecord = {
    schema: "csh-run/v1",
    component: p.component.manifest.name,
    snapshot: e.snapshot,
    snapshotDigest: e.report.snapshot!.digest!,
    harnesses,
    reportDigest: digestOf(reportText),
    gateDigest: digestOf(gateText),
  };
  const dir = runDir(o.storeRoot ?? p.root, record.snapshotDigest);
  write(join(dir, "report.json"), reportText);
  write(join(dir, "gate.json"), gateText);
  write(join(dir, "run.json"), stableJson(record));
  // The usual report files too, so that csh explain reads the run's report.
  write(join(p.root, REPORT_PATH), reportText);
  write(join(p.root, MODEL_PATH), stableJson(e.model));
  write(join(p.root, GATE_PATH), gateText);
  return { ok: true, record, report: e.report, decision, dir };
}

/** Files whose difference means a past commit needs other dependencies than the ones installed (A-38). */
export const DEPENDENCY_FILES = ["package.json", "pnpm-lock.yaml", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock"];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Run the component as it stood at a past commit (section 4.2), in a temporary worktree inside the project, so that
 * packages resolve from the project's own installation. Nothing is installed: when the commit's dependency files
 * differ from the working tree's, the run is refused with dependencies-differ and the stage is unavailable (A-38).
 */
export async function runAt(o: RunOptions & { commit: string }): Promise<RunResult> {
  const root = resolve(o.root);
  let top: string;
  let commit: string;
  try {
    top = git(root, "rev-parse", "--show-toplevel").trim();
    commit = git(root, "rev-parse", "--verify", `${o.commit}^{commit}`).trim();
  } catch {
    return { ok: false, code: "unknown-commit", message: `${o.commit} is not a commit of the repository at ${root}` };
  }
  const prefix = relative(top, root).split("\\").join("/");
  for (const dir of [...new Set([prefix, ""])]) {
    for (const f of DEPENDENCY_FILES) {
      const path = dir === "" ? f : `${dir}/${f}`;
      let then: string | undefined;
      try {
        then = git(top, "show", `${commit}:${path}`);
      } catch {
        then = undefined;
      }
      const nowFile = join(top, path);
      const now = existsSync(nowFile) ? readFileSync(nowFile, "utf8") : undefined;
      if (then !== now) return { ok: false, code: "dependencies-differ", message: `${path} at ${commit.slice(0, 12)} differs from the working tree; the commit is not run against other dependencies than its own (A-38)` };
    }
  }
  const wt = join(top, CACHE_DIR, "worktrees", `run-${commit}`);
  try {
    rmSync(wt, { recursive: true, force: true });
    try {
      git(top, "worktree", "prune");
    } catch {
      // Nothing to prune.
    }
    mkdirSync(dirname(wt), { recursive: true });
    git(top, "worktree", "add", "--detach", "--force", wt, commit);
    // A component inside a workspace (a package of a monorepo) resolves its packages from its own node_modules and
    // those of the directories above it, which a worktree does not have. The dependency files are the commit's own
    // (checked above), so the installed directories are linked in at the same paths.
    for (let d = prefix; d !== "" && d !== "."; d = dirname(d) === "." ? "" : dirname(d)) {
      const installed = join(top, d, "node_modules");
      if (existsSync(installed) && !existsSync(join(wt, d, "node_modules"))) symlinkSync(installed, join(wt, d, "node_modules"), "dir");
    }
    return await runComponent({ ...o, root: join(wt, prefix), storeRoot: root });
  } finally {
    try {
      git(top, "worktree", "remove", "--force", wt);
    } catch {
      rmSync(wt, { recursive: true, force: true });
    }
  }
}
