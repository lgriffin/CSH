// The history source (Ingesting a codebase, stage 25): what git says about the repository sources are read from, at
// its checked-out commit. Blame dates a line, `git log -L` finds when it was first written, rev-list lists the commits
// that changed a file since, and commit trailers say which changes name a reference and which an agent co-authored.
// Only commit hashes, dates and counts leave this file: never a commit's message or a line's text.
import { execFileSync } from "node:child_process";
import type { Dated, HistoryPort } from "@csh/check";

export interface HistoryOptions {
  /**
   * The tag or commit after which untraced changes are listed; none are without it. `previous-tag` is the newest tag
   * before the commit evaluated, so that a run at each release lists the changes made for that release.
   */
  since?: string;
  /** Paths whose change is a change to the implementation: a path, or a directory and everything under it. */
  implementation: string[];
}

/** The `since` that names the newest tag before the commit evaluated, whatever that commit is. */
export const PREVIOUS_TAG = "previous-tag";

/** A test file, by the conventions of JavaScript and TypeScript test runners (A-112). */
export const TEST_FILE = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

/** A Co-Authored-By trailer that names an agent (A-113). */
const AGENT_AUTHOR = /\bClaude\b|noreply@anthropic\.com/i;

function run(root: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return undefined;
  }
}

/** The history of the repository at `root`, read lazily and kept for the life of the port. */
export function gitHistory(root: string, o: HistoryOptions): HistoryPort & { sinceProblem?: string } {
  const dates = new Map<string, string>();
  for (const l of (run(root, ["log", "--format=%H %cI", "HEAD"]) ?? "").split("\n")) {
    const [h, d] = l.split(" ");
    if (h !== undefined && d !== undefined) dates.set(h, d);
  }
  const dated = (commit: string | undefined): Dated | undefined => {
    const date = commit === undefined ? undefined : dates.get(commit);
    return commit === undefined || date === undefined ? undefined : { commit, date };
  };

  const blames = new Map<string, Map<number, string>>();
  const blameOf = (path: string): Map<number, string> => {
    let m = blames.get(path);
    if (m !== undefined) return m;
    m = new Map();
    let commit: string | undefined;
    let line = 0;
    for (const l of (run(root, ["blame", "--line-porcelain", "HEAD", "--", path]) ?? "").split("\n")) {
      const head = /^([0-9a-f]{40}) \d+ (\d+)/.exec(l);
      if (head !== null) {
        commit = head[1];
        line = Number(head[2]);
      } else if (l.startsWith("\t") && commit !== undefined) m.set(line, commit);
    }
    blames.set(path, m);
    return m;
  };

  const origins = new Map<string, Dated | undefined>();
  const since = new Map<string, Dated[]>();
  const introduced = new Map<string, Dated | undefined>();

  let sinceProblem: string | undefined;
  let untraced: ReturnType<HistoryPort["untraced"]> | undefined;
  const start = o.since === PREVIOUS_TAG ? run(root, ["describe", "--tags", "--abbrev=0", "HEAD^"])?.trim() : o.since;
  const base = start === undefined || start === "" ? undefined : run(root, ["rev-parse", "--verify", "--quiet", `${start}^{commit}`])?.trim();
  if (o.since === PREVIOUS_TAG && base === undefined) sinceProblem = "history.since is previous-tag, and no tag precedes the commit evaluated";
  else if (o.since !== undefined && (base === undefined || base === "")) sinceProblem = `history.since names ${o.since}, which is not a commit of the subject`;
  else if (base !== undefined && run(root, ["merge-base", "--is-ancestor", base, "HEAD"]) === undefined) sinceProblem = `history.since names ${o.since}, which is not an ancestor of the commit evaluated`;
  const impl = (f: string) => o.implementation.some((i) => f === i || f.startsWith(i.endsWith("/") ? i : `${i}/`));

  const port: HistoryPort & { sinceProblem?: string } = {
    lineCommit: (path, line) => dated(blameOf(path).get(line)),
    lineOrigin(path, line) {
      const key = `${path}:${line}`;
      if (!origins.has(key)) {
        const out = run(root, ["log", "--no-patch", "--format=%H", `-L${line},${line}:${path}`, "HEAD"]);
        const commits = (out ?? "").split("\n").filter((x) => /^[0-9a-f]{40}$/.test(x));
        origins.set(key, dated(commits[commits.length - 1]));
      }
      return origins.get(key);
    },
    changedSince(commit, path) {
      const key = `${commit} ${path}`;
      let hit = since.get(key);
      if (hit === undefined) {
        hit = (run(root, ["rev-list", `${commit}..HEAD`, "--", path]) ?? "").split("\n").flatMap((c) => dated(c) ?? []);
        since.set(key, hit);
      }
      return hit;
    },
    introduced(path, text) {
      const key = `${path}\u0000${text}`;
      if (!introduced.has(key)) {
        const first = (run(root, ["log", "--format=%H", `-S${text}`, "HEAD", "--", path]) ?? "").split("\n")[0];
        introduced.set(key, dated(first));
      }
      return introduced.get(key);
    },
    untraced() {
      if (untraced !== undefined) return untraced;
      untraced = [];
      if (base === undefined || sinceProblem !== undefined) return untraced;
      const format = "%x1e%H%x1f%(trailers:key=Refs,valueonly,separator=%x2c)%x1f%(trailers:key=Claude-Session,valueonly,separator=%x2c)%x1f%(trailers:key=Co-Authored-By,valueonly,separator=%x2c)%x1f";
      for (const rec of (run(root, ["log", "--no-merges", "--name-only", `--format=${format}`, `${base}..HEAD`]) ?? "").split("\x1e").slice(1)) {
        const [hash, refs, session, coAuthors, names] = rec.split("\x1f");
        const files = (names ?? "").split("\n").filter((x) => x !== "");
        const changed = files.filter(impl).length;
        if (hash === undefined || changed === 0 || files.some((f) => TEST_FILE.test(f)) || (refs ?? "").trim() !== "") continue;
        const d = dated(hash);
        if (d === undefined) continue;
        untraced.push({ ...d, files: changed, agent: (session ?? "").trim() !== "" || AGENT_AUTHOR.test(coAuthors ?? "") });
      }
      return untraced;
    },
  };
  if (sinceProblem !== undefined) port.sinceProblem = sinceProblem;
  return port;
}
