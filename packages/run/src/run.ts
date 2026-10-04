// csh run (Anchor, harnesses and A3, section 4): one evaluation of one component at one snapshot. Each practice with
// a harness runs its own test command, which records witnesses; then the pipeline checks and the gate decides; then
// the run record is stored under .csh-cache/runs/<snapshot digest>/. A harness's exit code is stored as an execution
// fact and never enters a verdict (P2).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { COMPONENT_PATH, type ComponentManifest, DEFAULT_EXECUTIONS, DEFAULT_HARNESS_TIMEOUT_MS } from "@csh/component";
import type { Report } from "@csh/check";
import { formatDecision, type GateDecision, type Mode, type Snapshot } from "@csh/gate";
import { digestOf, type Module, stableJson } from "@csh/kernel";
import type { SolverPort } from "@csh/solver";
import { decideGate, emissionProblem, emitProject, evaluateProject } from "./evaluate.ts";
import { CACHE_DIR, CONFIG_PATH, loadProject, LOCK_PATH, MODEL_PATH, type Project, REPORT_PATH, specOf } from "./project.ts";

export const RUNS_DIR = `${CACHE_DIR}/runs`;
export const GATE_PATH = "reports/csh-gate.json";

export interface HarnessRecord {
  practice: string;
  argv: string[];
  /** The command's exit code; null when it ended by a signal or could not start. */
  exitCode: number | null;
  /** Lines the run added to the witness file. */
  witnesses: number;
  /** Lines the run added to the executions file. */
  executions: number;
  /** The harness runs with the project's own permissions, exactly as running the tests by hand would. */
  sandbox: "none";
  /** Why the command could not start, or that it timed out ("timed out after N ms"), when either happened. */
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

/** Signals that end csh while a harness runs; its process group no longer hears the terminal, so csh passes them on. */
const PASSED_ON = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

function exec(argv: string[], cwd: string, env: NodeJS.ProcessEnv, out: (s: string) => void, timeoutMs: number): Promise<{ exitCode: number | null; error?: string }> {
  return new Promise((done) => {
    // A process group of its own, so that a timeout kills the command and everything it started (#20).
    const child = spawn(argv[0]!, argv.slice(1), { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== "win32" && child.pid !== undefined) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        // Already gone.
      }
    };
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      kill("SIGKILL");
    }, timeoutMs);
    // Interrupted, csh takes the harness's whole tree with it, then ends as the signal would have ended it.
    const onSignal = (signal: NodeJS.Signals) => {
      kill(signal);
      release();
      process.kill(process.pid, signal);
    };
    const release = () => {
      clearTimeout(timer);
      for (const sig of PASSED_ON) process.removeListener(sig, onSignal);
    };
    for (const sig of PASSED_ON) process.on(sig, onSignal);
    child.stdout.on("data", (d: Buffer) => out(d.toString()));
    child.stderr.on("data", (d: Buffer) => out(d.toString()));
    child.on("error", (e) => {
      release();
      done({ exitCode: null, error: e.message });
    });
    child.on("close", (code) => {
      release();
      done(timedOut ? { exitCode: null, error: `timed out after ${timeoutMs} ms` } : { exitCode: code });
    });
  });
}

/** Run each practice's harness. Old witness and execution files are removed first, so a run never reads stale ones. */
export async function runHarnesses(p: Project, manifest: ComponentManifest, out: (s: string) => void): Promise<HarnessRecord[]> {
  const records: HarnessRecord[] = [];
  const harnessed = manifest.practices.filter((x) => x.harness !== undefined);
  // Every file is removed once, before any harness runs: two harnesses sharing a file (the default executions file
  // most often) both keep their lines.
  for (const x of harnessed) {
    for (const f of [x.harness!.witnesses, x.harness!.executions ?? DEFAULT_EXECUTIONS]) {
      rmSync(resolve(p.root, f), { force: true });
      mkdirSync(dirname(resolve(p.root, f)), { recursive: true });
    }
  }
  for (const practice of harnessed) {
    const h = practice.harness!;
    const witnesses = resolve(p.root, h.witnesses);
    const executions = resolve(p.root, h.executions ?? DEFAULT_EXECUTIONS);
    const env = { ...process.env, CSH_COMMIT: p.commit, CSH_WITNESS_FILE: witnesses, CSH_EXECUTIONS_FILE: executions };
    // A shared file already holds an earlier harness's lines: each record counts only the lines its own run added.
    const before = [countLines(witnesses), countLines(executions)] as const;
    const r = await exec(h.run, p.root, env, out, h.timeoutMs ?? DEFAULT_HARNESS_TIMEOUT_MS);
    const rec: HarnessRecord = { practice: practice.id, argv: [...h.run], exitCode: r.exitCode, witnesses: countLines(witnesses) - before[0], executions: countLines(executions) - before[1], sandbox: "none" };
    if (r.error !== undefined) rec.error = r.error;
    records.push(rec);
  }
  return records;
}

/** Relative imports of a module file, read lexically: `from "./x"`, `import "./x"`, `import("./x")`. */
const RELATIVE_IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;
/** Directories no input is read from. */
const NOT_INPUTS = new Set([".git", "node_modules", CACHE_DIR]);

/**
 * What a run evaluates, by project path, with each file's digest: the specification and the files it imports, every
 * file of every source, each practice's project-local adapter and step table, the manifest, the configuration and the lock. Only the harnesses' own witness and executions
 * files are left out, since writing them is their job; any other file in a harness's source directory is an input.
 */
export function inputDigests(p: Project, manifest: ComponentManifest, m: Module): Map<string, string> {
  const root = resolve(p.root);
  const harnessed = manifest.practices.filter((x) => x.harness !== undefined);
  const written = new Set(harnessed.flatMap((x) => [x.harness!.witnesses, x.harness!.executions ?? DEFAULT_EXECUTIONS]).map((f) => resolve(root, f)));
  const realRoot = realpathSync(root);
  const inRoot = (r: string) => !r.startsWith("..") && !isAbsolute(r);
  const out = new Map<string, string>();
  const walked = new Set<string>();
  const add = (abs: string, follow: boolean): void => {
    const rel = relative(root, abs).split("\\").join("/");
    if (!inRoot(rel) || written.has(abs) || out.has(rel)) return;
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      return void out.set(rel, "absent");
    }
    if (st.isSymbolicLink()) {
      // Both the link and what it reaches: runSources follows a link to a target inside the root and reads its bytes.
      out.set(`${rel} ->`, readlinkSync(abs));
      let real: string;
      try {
        real = realpathSync(abs);
      } catch {
        return void out.set(rel, "absent");
      }
      if (!inRoot(relative(realRoot, real))) return;
      st = statSync(abs);
    }
    if (st.isDirectory()) {
      // A link back to a directory already walked would never end.
      const real = realpathSync(abs);
      if (walked.has(real)) return void out.set(rel, "walked");
      walked.add(real);
      for (const e of readdirSync(abs)) if (!NOT_INPUTS.has(e)) add(join(abs, e), false);
      return;
    }
    const bytes = readFileSync(abs);
    out.set(rel, digestOf(bytes));
    if (follow) for (const i of bytes.toString("utf8").matchAll(RELATIVE_IMPORT)) add(resolve(dirname(abs), i[1]!), true);
  };
  add(specOf(p, undefined), true);
  for (const s of m.sources) add(resolve(root, s.at), false);
  // A practice's own code runs after the harnesses too: a project-local adapter and a step table, with what they import.
  for (const x of manifest.practices) {
    if (x.adapter !== undefined && (x.adapter.startsWith(".") || x.adapter.startsWith("/"))) add(resolve(root, x.adapter), true);
    if (x.steps !== undefined) add(resolve(root, x.steps), true);
  }
  for (const f of [COMPONENT_PATH, CONFIG_PATH, LOCK_PATH]) add(join(root, f), false);
  return out;
}

/** The paths whose digest differs between two inputDigests, in order. */
export function changedInputs(before: Map<string, string>, after: Map<string, string>): string[] {
  return [...new Set([...before.keys(), ...after.keys()])].filter((k) => (before.get(k) ?? "absent") !== (after.get(k) ?? "absent")).sort();
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** The directory a run is stored in: the same snapshot always gives the same directory. */
export function runDir(storeRoot: string, snapshotDigest: string): string {
  return join(storeRoot, RUNS_DIR, snapshotDigest.replace(/^sha256:/, ""));
}

/** The stored runs of a commit, newest first by modification. A stored run that cannot be read is skipped. */
export function storedRuns(storeRoot: string, commit: string): string[] {
  const runs = join(storeRoot, RUNS_DIR);
  if (!existsSync(runs)) return [];
  const found: { dir: string; at: number }[] = [];
  for (const d of readdirSync(runs)) {
    const file = join(runs, d, "run.json");
    try {
      if ((JSON.parse(readFileSync(file, "utf8")) as Partial<RunRecord>).snapshot?.commit === commit) found.push({ dir: join(runs, d), at: statSync(file).mtimeMs });
    } catch {
      // Not a run record.
    }
  }
  return found.sort((a, b) => b.at - a.at).map((x) => x.dir);
}

/**
 * Run the component at the root's current state. `storeRoot` is where the run record goes; it differs from the root
 * only for a run at a past commit, whose worktree is thrown away afterwards, and that run passes `reportFiles: false`.
 */
export async function runComponent(o: RunOptions & { storeRoot?: string; reportFiles?: boolean }): Promise<RunResult> {
  const p = loadProject(o.root, o.root);
  if (p.component === undefined && p.componentProblems.length === 0) return { ok: false, code: "no-component", message: `no csh/component.json under ${p.root}; csh run evaluates a component (csh init writes one)` };
  if (p.componentProblems.length > 0 || p.component === undefined) return { ok: false, code: "component-unusable", message: `the component manifest cannot be used:\n${p.componentProblems.map((e) => `  ${e.code}: ${e.detail}`).join("\n")}` };
  const eo = { solver: o.solver, ...(o.budgetMs !== undefined ? { budgetMs: o.budgetMs } : {}), ...(o.noCache === true ? { noCache: true } : {}) };
  // A component that will be refused runs none of its test commands: the manifest is checked against the
  // specification first, and that emission is the one evaluated (#18).
  const emission = await emitProject(p, eo);
  const refused = emissionProblem(emission);
  if (refused !== undefined) return { ok: false, code: "evaluation-failed", message: refused };
  if (!emission.emitted.ok) return { ok: false, code: "evaluation-failed", message: "emission failed" };
  const inputs = inputDigests(p, p.component.manifest, emission.emitted.module);
  const harnesses = await runHarnesses(p, p.component.manifest, o.harnessOutput ?? (() => undefined));
  // The snapshot and the emission were taken before the harnesses: a harness that changed what they were taken from
  // would make the record describe files other than the ones evaluated (#17).
  const moved = changedInputs(inputs, inputDigests(p, p.component.manifest, emission.emitted.module));
  if (moved.length > 0) return { ok: false, code: "inputs-changed-by-harness", message: `the harnesses changed ${moved.join(", ")}, which the run evaluates; a harness may write only its witness and executions files (A-57)` };
  const e = await evaluateProject(p, { ...eo, emission });
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
  // The model beside the report, so that csh explain --run reads a stored run as it reads the working tree's.
  write(join(dir, "model.json"), stableJson(e.model));
  // A run at a past commit writes nothing outside the run store: the worktree's report files are not the user's (#19).
  if (o.reportFiles === false) return { ok: true, record, report: e.report, decision, dir };
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
 * The workspace packages a component at `prefix` resolves through the installed node_modules on its path, and through
 * theirs in turn, whose files differ from the commit's. A run at the commit would load them from the working tree.
 */
function workspaceChanges(top: string, prefix: string, commit: string): string[] {
  const queue: string[] = [];
  for (let d = prefix; ; d = dirname(d) === "." ? "" : dirname(d)) {
    queue.push(join(top, d, "node_modules"));
    if (d === "" || d === ".") break;
  }
  const seen = new Set<string>([prefix]);
  const changed: string[] = [];
  for (let nm = queue.shift(); nm !== undefined; nm = queue.shift()) {
    if (!existsSync(nm)) continue;
    const entries = readdirSync(nm).flatMap((e) => (e.startsWith("@") ? readdirSync(join(nm, e)).map((x) => join(nm, e, x)) : e.startsWith(".") ? [] : [join(nm, e)]));
    for (const e of entries) {
      const inWorkspace = (rel: string) => !rel.startsWith("..") && !isAbsolute(rel) && !rel.split("/").includes("node_modules");
      let real: string;
      try {
        real = realpathSync(e);
      } catch {
        // A link whose target is gone: a workspace package deleted since the commit differs from it.
        let gone: string | undefined;
        try {
          gone = relative(top, resolve(dirname(e), readlinkSync(e))).split("\\").join("/");
        } catch {
          gone = undefined;
        }
        if (gone !== undefined && inWorkspace(gone) && !seen.has(gone)) {
          seen.add(gone);
          changed.push(gone || ".");
        }
        continue;
      }
      const rel = relative(top, real).split("\\").join("/");
      if (!inWorkspace(rel) || seen.has(rel)) continue;
      seen.add(rel);
      queue.push(join(real, "node_modules"));
      let differs = git(top, "ls-files", "--others", "--exclude-standard", "--", rel || ".").trim() !== "";
      try {
        git(top, "diff", "--quiet", commit, "--", rel || ".");
      } catch {
        differs = true;
      }
      if (differs) changed.push(rel || ".");
    }
  }
  return changed.sort();
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
  // Workspace packages are linked, not installed: one whose files changed since the commit would be today's (A-55).
  const changed = workspaceChanges(top, prefix, commit);
  if (changed.length > 0) return { ok: false, code: "workspace-differs", message: `the workspace package${changed.length === 1 ? "" : "s"} ${changed.join(", ")} differ${changed.length === 1 ? "s" : ""} from ${commit.slice(0, 12)}; the commit would run against the working tree's sources, not its own (A-55)` };
  // A directory of its own, so that two runs of one commit never remove each other's worktree.
  mkdirSync(join(top, CACHE_DIR, "worktrees"), { recursive: true });
  const wt = mkdtempSync(join(top, CACHE_DIR, "worktrees", `run-${commit.slice(0, 12)}-`));
  try {
    try {
      git(top, "worktree", "prune");
    } catch {
      // Nothing to prune.
    }
    git(top, "worktree", "add", "--detach", "--force", wt, commit);
    // A component inside a workspace (a package of a monorepo) resolves its packages from its own node_modules and
    // those of the directories above it, which a worktree does not have. The dependency files are the commit's own
    // (checked above), so the installed directories are linked in at the same paths.
    for (let d = prefix; d !== "" && d !== "."; d = dirname(d) === "." ? "" : dirname(d)) {
      const installed = join(top, d, "node_modules");
      if (existsSync(installed) && !existsSync(join(wt, d, "node_modules"))) symlinkSync(installed, join(wt, d, "node_modules"), "dir");
    }
    return await runComponent({ ...o, root: join(wt, prefix), storeRoot: root, reportFiles: false });
  } finally {
    try {
      git(top, "worktree", "remove", "--force", wt);
    } catch {
      rmSync(wt, { recursive: true, force: true });
    }
  }
}
