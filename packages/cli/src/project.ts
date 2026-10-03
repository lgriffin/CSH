// A project on disk: configuration, lock file, version control, ledger and snapshot
// (Authority tab, sections 2 and 4).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { emit, type Lock, readLock } from "@csh/emit";
import { digestJson, digestOf, fragmentsOf } from "@csh/kernel";
import { authorship, gitVcs, LEDGER_PATH, type LedgerState, MAINTAINERS_PATH, persons, readLedger, type VcsPort } from "@csh/ledger";
import type { Snapshot } from "@csh/gate";

export interface ProjectConfig {
  /** The specification module, relative to the project root. */
  spec?: string;
  budgetMs?: number;
  mode?: "advisory" | "enforcing";
  /** The commit holding the first, trusted maintainers file (normally pinned in CI instead). */
  rootCommit?: string;
  /** Paths whose change makes a witness from an earlier commit stale (Authority tab, section 5). */
  implementationPaths?: string[];
  /** Paths whose history decides who authored a fragment (default: the specification's directory). */
  specPaths?: string[];
  requirementIdPattern?: string;
  adapters?: Record<string, string>;
}

export interface Project {
  root: string;
  config: ProjectConfig;
  configDigest: string;
  lock?: Lock;
  lockDigest: string;
  vcs?: VcsPort;
  head?: string;
  /** HEAD, with "-dirty" appended when the working tree has uncommitted changes. */
  commit: string;
  commitDate: string;
}

export const CONFIG_PATH = "csh/config.json";
export const LOCK_PATH = "csh/lock.json";
export const REPORT_PATH = "reports/csh-report.json";
export const MODEL_PATH = "reports/csh-model.json";
export const CACHE_DIR = ".csh-cache";

function gitRoot(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

export function loadProject(cwd: string, rootOverride?: string): Project {
  const root = resolve(rootOverride ?? gitRoot(cwd) ?? cwd);
  const cfgFile = join(root, CONFIG_PATH);
  const config = existsSync(cfgFile) ? (JSON.parse(readFileSync(cfgFile, "utf8")) as ProjectConfig) : {};
  const lockFile = join(root, LOCK_PATH);
  const p: Project = {
    root,
    config,
    configDigest: existsSync(cfgFile) ? digestOf(readFileSync(cfgFile)) : digestJson(null),
    lockDigest: existsSync(lockFile) ? digestOf(readFileSync(lockFile)) : digestJson(null),
    commit: "uncommitted",
    commitDate: "",
  };
  const lock = readLock(lockFile);
  if (lock !== undefined) p.lock = lock;
  if (gitRoot(root) !== undefined) {
    try {
      const head = git(root, "rev-parse", "HEAD").trim();
      p.vcs = gitVcs(root);
      p.head = head;
      const dirty = git(root, "status", "--porcelain", "--untracked-files=no").trim() !== "";
      p.commit = dirty ? `${head}-dirty` : head;
      p.commitDate = git(root, "show", "-s", "--format=%cI", head).trim();
    } catch {
      // A repository with no commits yet.
    }
  }
  return p;
}

export function specOf(p: Project, arg: string | undefined): string {
  const s = arg ?? p.config.spec;
  if (s === undefined) throw new Error(`no specification given and ${CONFIG_PATH} names none`);
  return resolve(p.root, s);
}

/**
 * Fragment digests at a commit, for authorship: the specification is emitted from a
 * temporary worktree of that commit.
 */
async function digestsAtCommit(p: Project, spec: string, commit: string): Promise<ReadonlyMap<string, string> | undefined> {
  const wt = join(p.root, CACHE_DIR, "worktrees", commit);
  try {
    rmSync(wt, { recursive: true, force: true });
    mkdirSync(dirname(wt), { recursive: true });
    git(p.root, "worktree", "add", "--detach", "--force", wt, commit);
    const file = join(wt, relative(p.root, spec));
    if (!existsSync(file)) return undefined;
    const r = await emit(file, { root: wt, skipTypeCheck: true });
    return r.ok ? new Map(fragmentsOf(r.module).map((f) => [f.name, f.digest])) : undefined;
  } catch {
    return undefined;
  } finally {
    try {
      git(p.root, "worktree", "remove", "--force", wt);
    } catch {
      rmSync(wt, { recursive: true, force: true });
    }
  }
}

/** Read the ledger from history, when there is one. */
export async function ledgerOf(p: Project, spec: string): Promise<LedgerState | undefined> {
  if (p.vcs === undefined) return undefined;
  const vcs = p.vcs;
  if (vcs.commitsTouching(LEDGER_PATH).length === 0 && vcs.commitsTouching(MAINTAINERS_PATH).length === 0) return undefined;
  const opts = p.config.rootCommit !== undefined ? { rootCommit: p.config.rootCommit } : {};
  const plain = readLedger(vcs, opts);
  // Authorship matters only once a second person is listed (Authority tab, section 3.3).
  if (persons(plain.maintainers).length < 2) return plain;
  const specPaths = p.config.specPaths ?? [relative(p.root, dirname(spec)) || "."];
  const digests = new Map<string, ReadonlyMap<string, string> | undefined>();
  for (const c of [...new Set(specPaths.flatMap((sp) => vcs.commitsTouching(sp)))]) digests.set(c, await digestsAtCommit(p, spec, c));
  return readLedger(vcs, { ...opts, authorOf: authorship(vcs, specPaths, (c) => digests.get(c), opts) });
}

export function snapshotOf(p: Project, moduleDigest: string, ledger: LedgerState | undefined, solver: string, toolVersion: string): Snapshot {
  return { commit: p.commit, moduleDigest, ledgerHead: ledger?.head ?? 0, configDigest: p.configDigest, lockDigest: p.lockDigest, tool: { version: toolVersion, solver } };
}

/** A witness from an earlier commit stays current only if no implementation path changed since. */
export function unchangedSince(p: Project): ((a: string, b: string) => boolean) | undefined {
  const vcs = p.vcs;
  if (vcs === undefined) return undefined;
  // Conservative default (ASSUMPTIONS.md): with no implementation paths configured, every file outside csh/ counts.
  const impl = p.config.implementationPaths;
  return (a, b) => {
    const target = b.replace(/-dirty$/, "");
    if (!vcs.isAncestor(a, target)) return false;
    const changed = vcs.changedBetween(a, target);
    if (b.endsWith("-dirty")) return false;
    return !changed.some((f) => (impl === undefined ? !f.startsWith("csh/") : impl.some((i) => f === i || f.startsWith(i.endsWith("/") ? i : `${i}/`))));
  };
}
