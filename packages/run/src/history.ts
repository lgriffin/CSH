// The history source (Ingesting a codebase, stage 25): what git says about the repository sources are read from, at
// its checked-out commit. Blame dates a line, `git log -L` finds when it was first written, rev-list lists the commits
// that changed a file since, and commit trailers say which changes name a reference and which an agent co-authored.
// Only commit hashes, dates and counts leave this file: never a commit's message or a line's text.
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, posix } from "node:path";
import type { Dated, HistoryPort } from "@csh/check";

export interface HistoryOptions {
  /**
   * The tag or commit after which untraced changes are listed; none are without it. `previous-tag` is the newest tag
   * before the commit evaluated, so that a run at each release lists the changes made for that release.
   */
  since?: string;
  /** Globs of documents that record a moment: release notes, decisions. Prose in them is never stale-prose. */
  frozen?: string[];
  /** Files that change all the time (package.json, a composition root): prose naming them is never stale (stage 43). */
  volatile?: string[];
  /** Globs of paths that hold tests beside the usual conventions (a feature directory, a step directory). */
  tests?: string[];
  /** Paths whose change is a change to the implementation: a path, or a directory and everything under it. */
  implementation: string[];
  /**
   * A file to keep answers in between runs (stage 27). A commit's history never changes, so what was read at one HEAD
   * is read from the file at that HEAD again, and nothing is asked of git twice. Files with uncommitted changes are
   * never kept.
   */
  cache?: string;
  /** The tool's code, kept with the answers: a change to how history is read is never answered from the cache. */
  tool?: string;
}

interface Kept {
  schema: "csh-history-cache/v1";
  key: string;
  blames: Record<string, Record<string, string>>;
  origins: Record<string, string | null>;
  since: Record<string, string[]>;
  introduced: Record<string, string | null>;
  /** The commits that changed each file, and whether a path was ever held by any commit (stage 40). */
  touching?: Record<string, string[]>;
  existed?: Record<string, boolean>;
}

/** The `since` that names the newest tag before the commit evaluated, whatever that commit is. */
export const PREVIOUS_TAG = "previous-tag";

/** A test file, by the conventions of JavaScript and TypeScript test runners (A-112). */
export const TEST_FILE = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

/** A path glob as a pattern: `**` crosses directories, `*` does not, and a glob with no wildcard names a directory or a file. */
export function globPattern(glob: string): RegExp {
  let body = "";
  for (let k = 0; k < glob.length; k++) {
    const c = glob[k]!;
    if (c === "*" && glob[k + 1] === "*") {
      // A trailing ** is everything under the directory, files too (stage 63): `.beads/**` holds `.beads/issues.jsonl`.
      body += k + 2 === glob.length ? ".*" : "(?:.*/)?";
      k += glob[k + 2] === "/" ? 2 : 1;
    } else if (c === "*") body += "[^/]*";
    else if (c === "?") body += "[^/]";
    else body += ".+^${}()|[]\\".includes(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${body}(?:/.*)?$`);
}

/** A Co-Authored-By trailer that names an agent (A-113). */
const AGENT_AUTHOR = /\bClaude\b|noreply@anthropic\.com/i;

function run(root: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return undefined;
  }
}

/** The same question as run, asked without waiting: many can be in flight, which a process spawn each makes worth doing. */
function runAsync(root: string, args: string[]): Promise<string | undefined> {
  return new Promise((done) => {
    execFile("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }, (err, stdout) => done(err === null ? stdout : undefined));
  });
}

/** Run the tasks `width` at a time. */
async function pool(width: number, tasks: (() => Promise<void>)[]): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, tasks.length) }, async () => {
    while (next < tasks.length) await tasks[next++]!();
  }));
}

/** The history of the repository at `root`, read lazily and kept for the life of the port. */
export function gitHistory(root: string, o: HistoryOptions): HistoryPort & { sinceProblem?: string; save(): void } {
  const everHeld = new Map<string, boolean>();
  const testGlobs = (o.tests ?? []).map(globPattern);
  const frozenGlobs = (o.frozen ?? []).map(globPattern);
  const volatileGlobs = (o.volatile ?? []).map(globPattern);
  const dates = new Map<string, string>();
  for (const l of (run(root, ["log", "--format=%H %cI", "HEAD"]) ?? "").split("\n")) {
    const [h, d] = l.split(" ");
    // In UTC, one way: git versions write a zero offset as +00:00 or as Z.
    if (h !== undefined && d !== undefined && !Number.isNaN(Date.parse(d))) dates.set(h, new Date(d).toISOString().replace(/\.\d{3}Z$/, "Z"));
  }
  const dated = (commit: string | undefined): Dated | undefined => {
    const date = commit === undefined ? undefined : dates.get(commit);
    return commit === undefined || date === undefined ? undefined : { commit, date };
  };

  // A file with uncommitted changes has other line numbers than HEAD's: none of its lines is dated.
  // One git process names every file that differs from HEAD. If git cannot say, every file counts as edited.
  let editedFiles: Set<string> | undefined | null;
  const isEdited = (path: string): boolean => {
    if (editedFiles === undefined) {
      const out = run(root, ["diff", "--name-only", "--relative", "-z", "HEAD"]);
      editedFiles = out === undefined ? null : new Set(out.split("\0").filter((x) => x !== ""));
    }
    return editedFiles === null || editedFiles.has(path);
  };

  // How commits descend from one another, read once: "is this commit before that one" is then a walk in memory, and the
  // commits after a line that touch a file are those touching it that the line's commit does not reach.
  let parents: Map<string, string[]> | undefined;
  const graph = (): Map<string, string[]> => {
    if (parents === undefined) {
      parents = new Map();
      for (const l of (run(root, ["rev-list", "--parents", "HEAD"]) ?? "").split("\n")) {
        const [c, ...ps] = l.trim().split(" ");
        if (c !== undefined && c !== "") parents.set(c, ps);
      }
    }
    return parents;
  };
  const reach = new Map<string, Set<string>>();
  const reachFrom = (commit: string): Set<string> => {
    let seen = reach.get(commit);
    if (seen !== undefined) return seen;
    seen = new Set();
    const g = graph();
    const todo = [commit];
    while (todo.length > 0) {
      const c = todo.pop()!;
      if (seen.has(c)) continue;
      seen.add(c);
      todo.push(...(g.get(c) ?? []));
    }
    reach.set(commit, seen);
    return seen;
  };
  // The commits that changed a file, as git's own path-limited history says: asked per path, and kept. prefetch asks for
  // many at once, so a run waits for a few batches rather than for each in turn.
  const touching = new Map<string, string[]>();
  const listOf = (out: string | undefined): string[] => (out ?? "").split("\n").filter((x) => x !== "");
  const commitsTouching = (path: string): string[] => {
    let cs = touching.get(path);
    if (cs === undefined) {
      touching.set(path, (cs = listOf(run(root, ["rev-list", "HEAD", "--", path]))));
      dirty = true;
    }
    return cs;
  };
  const blames = new Map<string, Map<number, string>>();
  const parseBlame = (out: string | undefined): Map<number, string> => {
    const m = new Map<number, string>();
    let commit: string | undefined;
    let line = 0;
    for (const l of (out ?? "").split("\n")) {
      const head = /^([0-9a-f]{40}) \d+ (\d+)/.exec(l);
      if (head !== null) {
        commit = head[1];
        line = Number(head[2]);
      } else if (l.startsWith("\t") && commit !== undefined) m.set(line, commit);
    }
    return m;
  };
  const blameOf = (path: string): Map<number, string> => {
    // Kept or not, a file with uncommitted changes has no dated line.
    if (isEdited(path)) return new Map();
    let m = blames.get(path);
    if (m !== undefined) return m;
    m = parseBlame(run(root, ["blame", "--line-porcelain", "HEAD", "--", path]));
    blames.set(path, m);
    dirty = true;
    return m;
  };

  const origins = new Map<string, Dated | undefined>();
  const since = new Map<string, Dated[]>();
  const introduced = new Map<string, Dated | undefined>();

  // What an earlier run at the same HEAD read: kept by commit, read back as dated answers.
  const head = run(root, ["rev-parse", "HEAD"])?.trim();
  const cacheKey = head === undefined ? undefined : `${head} ${o.since ?? ""} ${o.tool ?? ""}`;
  let dirty = false;
  if (o.cache !== undefined && cacheKey !== undefined && existsSync(o.cache)) {
    try {
      const k = JSON.parse(readFileSync(o.cache, "utf8")) as Kept;
      if (k.schema === "csh-history-cache/v1" && k.key === cacheKey) {
        for (const [path, lines] of Object.entries(k.blames)) blames.set(path, new Map(Object.entries(lines).map(([l, c]) => [Number(l), c])));
        for (const [key, c] of Object.entries(k.origins)) origins.set(key, c === null ? undefined : dated(c));
        for (const [key, cs] of Object.entries(k.since)) since.set(key, cs.flatMap((c) => dated(c) ?? []));
        for (const [key, c] of Object.entries(k.introduced)) introduced.set(key, c === null ? undefined : dated(c));
        for (const [path, cs] of Object.entries(k.touching ?? {})) touching.set(path, cs);
        for (const [path, held] of Object.entries(k.existed ?? {})) everHeld.set(path, held);
      }
    } catch {
      // A cache that cannot be read only costs the reads.
    }
  }

  let sinceProblem: string | undefined;
  let untraced: ReturnType<HistoryPort["untraced"]> | undefined;
  const start = o.since === PREVIOUS_TAG ? run(root, ["describe", "--tags", "--abbrev=0", "HEAD^"])?.trim() : o.since;
  const base = start === undefined || start === "" ? undefined : run(root, ["rev-parse", "--verify", "--quiet", `${start}^{commit}`])?.trim();
  if (o.since === PREVIOUS_TAG && base === undefined) sinceProblem = "history.since is previous-tag, and no tag precedes the commit evaluated";
  else if (o.since !== undefined && (base === undefined || base === "")) sinceProblem = `history.since names ${o.since}, which is not a commit of the subject`;
  else if (base !== undefined && run(root, ["merge-base", "--is-ancestor", base, "HEAD"]) === undefined) sinceProblem = `history.since names ${o.since}, which is not an ancestor of the commit evaluated`;
  // Paths are read as the manifest writes them: `./src` is `src`, and `.` is everything.
  const paths = o.implementation.map((i) => i.replace(/^(\.\/)+/, "").replace(/\/+$/, ""));
  const impl = (f: string) => paths.some((i) => i === "" || i === "." || f === i || f.startsWith(`${i}/`));

  const port: HistoryPort & { sinceProblem?: string } = {
    lineCommit: (path, line) => dated(blameOf(path).get(line)),
    lineOrigin(path, line) {
      const key = `${path}:${line}`;
      if (isEdited(path)) return undefined;
      if (!origins.has(key)) {
        const out = run(root, ["log", "--no-patch", "--format=%H", `-L${line},${line}:${path}`, "HEAD"]);
        const commits = (out ?? "").split("\n").filter((x) => /^[0-9a-f]{40}$/.test(x));
        origins.set(key, dated(commits[commits.length - 1]));
        dirty = true;
      }
      return origins.get(key);
    },
    changedSince(commit, path) {
      const key = `${commit} ${path}`;
      let hit = since.get(key);
      if (hit === undefined) {
        // After the line, in time as well as in history: a commit of a branch that forked before the line and merged
        // after it is reachable from HEAD and not from the line, though it was made first. A merge that only brings a
        // branch in is the same as one parent and is left out by git; one that resolves a conflict in the file is kept.
        // A commit made in the same second as the line counts, since scripted and rebased commits share a time.
        const from = dated(commit);
        // A commit the graph does not know (the history was cut) is asked of git directly, as before.
        const known = graph().has(commit);
        const after = known ? commitsTouching(path).filter((c) => !reachFrom(commit).has(c)) : (run(root, ["rev-list", `${commit}..HEAD`, "--", path]) ?? "").split("\n");
        hit = after.flatMap((c) => dated(c) ?? []).filter((d) => from === undefined || d.date >= from.date);
        since.set(key, hit);
        dirty = true;
      }
      return hit;
    },
    introduced(path, text) {
      const key = `${path}\u0000${text}`;
      if (!introduced.has(key)) {
        const first = (run(root, ["log", "--format=%H", `-S${text}`, "HEAD", "--", path]) ?? "").split("\n")[0];
        introduced.set(key, dated(first));
        dirty = true;
      }
      return introduced.get(key);
    },
    existed(path) {
      if (!everHeld.has(path)) {
        // Asked of the commit's own history, never of whatever branches the checkout happens to hold, so a clone and a
        // worktree of the same commit agree (stage 41). --full-history keeps a branch that added and removed the path
        // before it merged, which git's default simplification would skip.
        everHeld.set(path, (run(root, ["log", "--full-history", "--format=%H", "-1", "HEAD", "--", path]) ?? "").trim() !== "");
        dirty = true;
      }
      return everHeld.get(path)!;
    },
    async prefetch(want: { files: string[]; documents: string[] }) {
      const tracked = new Set(listOf(await runAsync(root, ["ls-files"])));
      // A bare file name resolves to the one tracked file of that name (A-110), so ask for that file now too.
      const byName = new Map<string, string[]>();
      for (const t of tracked) {
        const list = byName.get(posix.basename(t));
        if (list === undefined) byName.set(posix.basename(t), [t]);
        else list.push(t);
      }
      const resolved = want.files.map((f) => (tracked.has(f) || f.includes("/") || byName.get(f)?.length !== 1 ? f : byName.get(f)![0]!));
      const files = [...new Set(resolved)].filter((f) => tracked.has(f) && !touching.has(f));
      const documents = [...new Set(want.documents)].filter((d) => tracked.has(d) && !blames.has(d) && !isEdited(d));
      await pool(8, [
        ...files.map((f) => async () => {
          touching.set(f, listOf(await runAsync(root, ["rev-list", "HEAD", "--", f])));
          dirty = true;
        }),
        ...documents.map((d) => async () => {
          blames.set(d, parseBlame(await runAsync(root, ["blame", "--line-porcelain", "HEAD", "--", d])));
          dirty = true;
        }),
      ]);
    },
    frozen: (path: string) => frozenGlobs.some((g) => g.test(path)),
    volatile: (path: string) => volatileGlobs.some((g) => g.test(path)),
    untraced() {
      if (untraced !== undefined) return untraced;
      untraced = [];
      // --relative names files from the root, as the implementation paths are, when the root is below the top level.
      if (base === undefined || sinceProblem !== undefined) return untraced;
      const format = "%x1e%H%x1f%(trailers:key=Refs,valueonly,separator=%x2c)%x1f%(trailers:key=Claude-Session,valueonly,separator=%x2c)%x1f%(trailers:key=Co-Authored-By,valueonly,separator=%x2c)%x1f";
      for (const rec of (run(root, ["log", "--no-merges", "--relative", "--name-only", `--format=${format}`, `${base}..HEAD`]) ?? "").split("\x1e").slice(1)) {
        const [hash, refs, session, coAuthors, names] = rec.split("\x1f");
        const files = (names ?? "").split("\n").filter((x) => x !== "");
        const changed = files.filter(impl).length;
        if (hash === undefined || changed === 0 || files.some((f) => TEST_FILE.test(f) || testGlobs.some((g) => g.test(f))) || (refs ?? "").trim() !== "") continue;
        const d = dated(hash);
        if (d === undefined) continue;
        untraced.push({ ...d, files: changed, agent: (session ?? "").trim() !== "" || AGENT_AUTHOR.test(coAuthors ?? "") });
      }
      return untraced;
    },
  };
  if (sinceProblem !== undefined) port.sinceProblem = sinceProblem;
  return {
    ...port,
    save() {
      if (o.cache === undefined || cacheKey === undefined || !dirty) return;
      // Only what HEAD alone decides is kept: no blame of a file with uncommitted changes, and no origin of its lines.
      const clean = (path: string) => !isEdited(path);
      const pathOf = (key: string) => key.slice(0, key.lastIndexOf(":"));
      const kept: Kept = {
        schema: "csh-history-cache/v1",
        key: cacheKey,
        blames: Object.fromEntries([...blames].filter(([p]) => clean(p)).map(([p, m]) => [p, Object.fromEntries([...m].map(([l, c]) => [String(l), c]))])),
        origins: Object.fromEntries([...origins].filter(([k]) => clean(pathOf(k))).map(([k, d]) => [k, d?.commit ?? null])),
        since: Object.fromEntries([...since].map(([k, ds]) => [k, ds.map((d) => d.commit)])),
        introduced: Object.fromEntries([...introduced].map(([k, d]) => [k, d?.commit ?? null])),
        touching: Object.fromEntries(touching),
        existed: Object.fromEntries(everHeld),
      };
      try {
        mkdirSync(dirname(o.cache), { recursive: true });
        writeFileSync(`${o.cache}.tmp`, JSON.stringify(kept));
        renameSync(`${o.cache}.tmp`, o.cache);
      } catch {
        // The cache only saves work.
      }
    },
  };
}
