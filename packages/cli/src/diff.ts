// csh diff <base> <head> (Next layers, section 5): what a change did to the results of one component. Each side is a
// stored run's directory or a commit; a commit with no stored run is run at that commit, and one that cannot be run is
// unavailable, never an empty diff (A-77). The diff reads and never decides: it exits 0 whenever it could be made.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stableJson } from "@csh/kernel";
import { type DiffContext, diffRuns, renderDiff, type RunSide, type Unavailable } from "@csh/review";
import { type Project, readStoredRun, runAt, type RunOptions, runComponent, storedRuns } from "@csh/run";
import type { Args } from "./args.ts";

export interface DiffIo {
  out: (s: string) => void;
  err: (s: string) => void;
  runOptions: () => Promise<RunOptions>;
  /** Set in continuous integration, where a dirty head is refused (section 5.3). */
  ci: boolean;
  /** Where a side's relative directory is resolved from. */
  cwd: string;
}

const git = (p: Project, ...args: string[]) => execFileSync("git", args, { cwd: p.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

const hasRun = (dir: string) => existsSync(join(dir, "run.json")) && existsSync(join(dir, "report.json")) && existsSync(join(dir, "gate.json"));

/**
 * One side: "." is the working tree, run now; a directory holding a stored run is read; "unavailable:<why>" is a side
 * the caller could not have, such as a merge base that would not install (the CI job); anything else is a commit.
 */
async function sideOf(p: Project, arg: string, io: DiffIo, which: "base" | "head"): Promise<RunSide | Unavailable> {
  if (arg.startsWith("unavailable:")) return { unavailable: arg.slice("unavailable:".length) || "unavailable" };
  const dir = resolve(io.cwd, arg);
  if (arg !== "." && existsSync(dir) && statSync(dir).isDirectory()) {
    if (!hasRun(dir)) return { unavailable: `${arg} holds no stored run (run.json, report.json and gate.json)` };
    return readStoredRun(dir);
  }
  if (arg === ".") {
    const r = await runComponent(await io.runOptions());
    if (!r.ok) return { unavailable: `${r.code}: ${r.message}` };
    if (io.ci && r.record.snapshot.commit.endsWith("-dirty")) return { unavailable: "dirty-tree: a dirty working tree is refused in continuous integration" };
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
  io.err(`csh diff: no stored run of the ${which} ${commit.slice(0, 12)}; running it\n`);
  const r = await runAt({ ...(await io.runOptions()), commit });
  return r.ok ? readStoredRun(r.dir) : { unavailable: `${r.code}: ${r.message}` };
}

/** Paths changed between the two sides' commits, relative to the component root; none when git cannot say. */
function changesBetween(p: Project, base: RunSide, head: RunSide): string[] | undefined {
  const b = base.run.snapshot.commit.replace(/-dirty$/, "");
  const h = head.run.snapshot.commit;
  try {
    const args = ["diff", "--name-only", "--relative", b, ...(h.endsWith("-dirty") ? [] : [h]), "--", "."];
    return git(p, ...args).split("\n").filter((l) => l !== "");
  } catch {
    return undefined;
  }
}

export async function diffCommand(p: Project, a: Args, io: DiffIo): Promise<number> {
  const [baseArg, headArg] = a.positional;
  if (baseArg === undefined || headArg === undefined) {
    io.err("usage: csh diff <base> <head> [--json] [--out <dir>]   (each a stored run's directory, a commit, or . for the working tree)\n");
    return 2;
  }
  const base = await sideOf(p, baseArg, io, "base");
  const head = await sideOf(p, headArg, io, "head");
  const ctx: DiffContext = {};
  if (p.component !== undefined) ctx.manifest = p.component.manifest;
  if (!("unavailable" in base) && !("unavailable" in head)) {
    const changes = changesBetween(p, base, head);
    if (changes !== undefined) ctx.changes = changes;
  }
  const d = diffRuns(base, head, ctx);
  const text = renderDiff(d);
  if (a.options.out !== undefined) {
    const out = resolve(io.cwd, a.options.out);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "diff.json"), stableJson(d));
    writeFileSync(join(out, "diff.md"), text);
  }
  io.out(a.flags.has("json") ? stableJson(d) : text);
  return d.comparison === "head-unavailable" ? 1 : 0;
}
