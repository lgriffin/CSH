// The two sides of a diff, found for a component (Next layers, section 5.3): a stored run's directory, a commit (its
// stored run, else a run at that commit), "." for the working tree, or "unavailable:<why>". Shared by csh diff and the
// agent's diff tool. A side that cannot be had is unavailable, with why; it is never read as no change (A-77).
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Project, readStoredRun, runAt, type RunOptions, runComponent, storedRuns } from "@csh/run";
import { type DiffContext, diffRuns, type RunDiff, type RunSide, type Unavailable } from "./diff.ts";

export interface SideOptions {
  runOptions: () => Promise<RunOptions>;
  /** Set in continuous integration, where a dirty head is refused (section 5.3). */
  ci: boolean;
  /** Where a side's relative directory is resolved from. */
  cwd: string;
  /** Told when a commit with no stored run is run. */
  note?: (s: string) => void;
}

const git = (p: Project, ...args: string[]) => execFileSync("git", args, { cwd: p.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

const hasRun = (dir: string) => existsSync(join(dir, "run.json")) && existsSync(join(dir, "report.json")) && existsSync(join(dir, "gate.json"));

/**
 * One side: "." is the working tree, run now; a directory holding a stored run is read; "unavailable:<why>" is a side
 * the caller could not have, such as a merge base that would not install (the CI job); anything else is a commit.
 */
export async function sideOf(p: Project, arg: string, o: SideOptions, which: "base" | "head"): Promise<RunSide | Unavailable> {
  if (arg.startsWith("unavailable:")) return { unavailable: arg.slice("unavailable:".length) || "unavailable" };
  const dir = resolve(o.cwd, arg);
  if (arg !== "." && existsSync(dir) && statSync(dir).isDirectory()) {
    if (!hasRun(dir)) return { unavailable: `${arg} holds no stored run (run.json, report.json and gate.json)` };
    return readStoredRun(dir);
  }
  if (arg === ".") {
    const r = await runComponent(await o.runOptions());
    if (!r.ok) return { unavailable: `${r.code}: ${r.message}` };
    if (o.ci && (r.record.snapshot.commit.endsWith("-dirty") || untracked(p).length > 0)) return { unavailable: "dirty-tree: a dirty working tree is refused in continuous integration" };
    return readStoredRun(r.dir);
  }
  let commit: string;
  try {
    commit = git(p, "rev-parse", "--verify", `${arg}^{commit}`);
  } catch {
    return { unavailable: `unknown-commit: ${arg} is neither a stored run's directory nor a commit` };
  }
  const stored = storedRuns(p.root, commit).find(hasRun);
  if (stored !== undefined) return readStoredRun(stored);
  o.note?.(`csh diff: no stored run of the ${which} ${commit.slice(0, 12)}; running it\n`);
  const r = await runAt({ ...(await o.runOptions()), commit });
  return r.ok ? readStoredRun(r.dir) : { unavailable: `${r.code}: ${r.message}` };
}

/** Files of the component that git does not track and does not ignore. */
function untracked(p: Project): string[] {
  try {
    return git(p, "ls-files", "--others", "--exclude-standard", "--", ".").split("\n").filter((l) => l !== "");
  } catch {
    return [];
  }
}

/** Paths changed between the two sides' commits, relative to the component root; none when git cannot say. */
export function changesBetween(p: Project, base: RunSide, head: RunSide, workingTree = head.run.snapshot.commit.endsWith("-dirty")): string[] | undefined {
  const b = base.run.snapshot.commit.replace(/-dirty$/, "");
  const h = head.run.snapshot.commit;
  try {
    const args = ["diff", "--name-only", "--relative", b, ...(h.endsWith("-dirty") ? [] : [h]), "--", "."];
    const changed = git(p, ...args).split("\n").filter((l) => l !== "");
    // A working-tree head also changed whatever it added without telling git.
    return workingTree ? [...new Set([...changed, ...untracked(p)])].sort() : changed;
  } catch {
    return undefined;
  }
}

/** The diff of a component between two sides, with its manifest and the paths changed between them. */
export async function diffProject(p: Project, baseArg: string, headArg: string, o: SideOptions): Promise<RunDiff> {
  const base = await sideOf(p, baseArg, o, "base");
  const head = await sideOf(p, headArg, o, "head");
  const ctx: DiffContext = {};
  if (p.component !== undefined) ctx.manifest = p.component.manifest;
  if (!("unavailable" in base) && !("unavailable" in head)) {
    const changes = changesBetween(p, base, head, headArg === "." || head.run.snapshot.commit.endsWith("-dirty"));
    if (changes !== undefined) ctx.changes = changes;
  }
  return diffRuns(base, head, ctx);
}
