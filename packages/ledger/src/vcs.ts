// The version-control port, so that ledger rules can be tested without a repository,
// and its git implementation. Signature checking is git's (and gpg's); trust in a key
// comes only from csh/maintainers.json, never from the keyring's own trust model.
import { execFileSync } from "node:child_process";
import { posix } from "node:path";

export interface CommitInfo {
  hash: string;
  parents: string[];
  /** Committer date, ISO 8601. */
  date: string;
  /** The verified signing key, when the commit carries a good signature. */
  signature?: { fingerprints: string[] };
  /** Paths changed relative to the first parent (or all paths for a root commit). */
  changed: string[];
}

export interface VcsPort {
  head(): string;
  /** Commits that changed a path, oldest first, reachable from the head. */
  commitsTouching(path: string): string[];
  commit(hash: string): CommitInfo;
  fileAt(hash: string, path: string): string | undefined;
  isAncestor(ancestor: string, descendant: string): boolean;
  changedBetween(a: string, b: string): string[];
}

export interface GitOptions {
  /** Environment for git and gpg, such as GNUPGHOME. */
  env?: NodeJS.ProcessEnv;
}

export function gitVcs(dir: string, opts: GitOptions = {}): VcsPort {
  const env = { ...process.env, ...(opts.env ?? {}), LC_ALL: "C" };
  const git = (...args: string[]): string => execFileSync("git", args, { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  const cache = new Map<string, CommitInfo>();
  // Paths are relative to dir, which may sit below the repository's top level (a component root, such as
  // packages/gate). git reports changed paths from the top level, so they are rebased onto dir; a path outside dir
  // keeps a leading "../" and so never matches a path inside it.
  let prefix = "";
  try {
    prefix = git("rev-parse", "--show-prefix").trim();
  } catch {
    // Not a repository yet; every call below fails in its own way.
  }
  const local = (paths: string[]): string[] => (prefix === "" ? paths : paths.map((p) => posix.relative(prefix, p)));
  return {
    head: () => git("rev-parse", "HEAD").trim(),
    commitsTouching(path) {
      const out = git("log", "--reverse", "--topo-order", "--format=%H", "--", path).trim();
      return out === "" ? [] : out.split("\n");
    },
    commit(hash) {
      const hit = cache.get(hash);
      if (hit !== undefined) return hit;
      const [h, parents, date, status, fpr, primary] = git("show", "-s", "--format=%H%x00%P%x00%cI%x00%G?%x00%GF%x00%GP", hash).replace(/\n$/, "").split("\0");
      const ps = (parents ?? "").trim() === "" ? [] : parents!.trim().split(" ");
      const changed = local((ps.length === 0 ? git("show", "--format=", "--name-only", "--root", hash) : git("diff", "--name-only", ps[0]!, hash)).split("\n").filter((x) => x !== ""));
      const info: CommitInfo = { hash: h!, parents: ps, date: date!, changed };
      // G: good; U: good, key validity unknown to the keyring. Validity is decided by maintainers.json.
      if (status === "G" || status === "U") info.signature = { fingerprints: [fpr ?? "", primary ?? ""].filter((x) => x !== "").map(normaliseFingerprint) };
      cache.set(hash, info);
      return info;
    },
    fileAt(hash, path) {
      try {
        return git("show", `${hash}:${prefix}${path}`);
      } catch {
        return undefined;
      }
    },
    isAncestor(a, b) {
      try {
        git("merge-base", "--is-ancestor", a, b);
        return true;
      } catch {
        return false;
      }
    },
    changedBetween: (a, b) => local(git("diff", "--name-only", a, b).split("\n").filter((x) => x !== "")),
  };
}

export function normaliseFingerprint(f: string): string {
  return f.replace(/\s+/g, "").toUpperCase();
}

/** An in-memory history, for tests of the ledger rules. */
export interface MemoryCommit {
  hash: string;
  parent?: string;
  date?: string;
  signer?: string;
  files: Record<string, string>;
}

export function memoryVcs(commits: MemoryCommit[]): VcsPort {
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const snapshot = (hash: string | undefined): Record<string, string> => {
    const chain: MemoryCommit[] = [];
    for (let h = hash; h !== undefined; h = byHash.get(h)?.parent) chain.unshift(byHash.get(h)!);
    return Object.assign({}, ...chain.map((c) => c.files)) as Record<string, string>;
  };
  const changed = (c: MemoryCommit) => {
    const before = snapshot(c.parent);
    return Object.keys(c.files).filter((p) => before[p] !== c.files[p]).sort();
  };
  const order = commits.map((c) => c.hash);
  return {
    head: () => order[order.length - 1]!,
    commitsTouching: (path) => commits.filter((c) => changed(c).includes(path)).map((c) => c.hash),
    commit(hash) {
      const c = byHash.get(hash)!;
      const info: CommitInfo = { hash, parents: c.parent === undefined ? [] : [c.parent], date: c.date ?? "2026-10-03T12:00:00Z", changed: changed(c) };
      if (c.signer !== undefined) info.signature = { fingerprints: [normaliseFingerprint(c.signer)] };
      return info;
    },
    fileAt: (hash, path) => snapshot(hash)[path],
    isAncestor: (a, b) => {
      for (let h: string | undefined = b; h !== undefined; h = byHash.get(h)?.parent) if (h === a) return true;
      return false;
    },
    changedBetween: (a, b) => {
      const x = snapshot(a);
      const y = snapshot(b);
      return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((p) => x[p] !== y[p]).sort();
    },
  };
}
