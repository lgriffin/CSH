// Process and safety (From real runs, stage 44): a profile names a subject repository, and committing it says where that
// repository is. Two warnings, neither of which stops anything: a subject that is private, asked of `gh` when it is
// installed, since its profile should not be committed to a public repository; and a committed manifest that names its
// subject by a local path, which works only on the machine that wrote it.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { COMPONENT_PATH } from "@csh/component";
import { CACHE_DIR, type Project } from "./project.ts";

/** Run a command and return its output, or undefined when it cannot run or fails. */
export type Exec = (cmd: string, args: string[], cwd?: string) => string | undefined;

const defaultExec: Exec = (cmd, args, cwd) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 });
  } catch {
    return undefined;
  }
};

/** `owner/name` of a GitHub repository URL (https, ssh or scp-like), else undefined. */
export function githubSlug(repo: string): string | undefined {
  const m = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(repo);
  return m === null ? undefined : `${m[1]}/${m[2]}`;
}

/** True when `repo` names a directory rather than a URL: no scheme, and not scp-like `user@host:path`. */
export const isPathRepo = (repo: string): boolean => !/^[a-z][a-z0-9+.-]*:\/\//i.test(repo) && !/^[\w.-]+@[\w.-]+:/.test(repo);

/** Where `csh subject fetch` keeps the visibility GitHub gave, so that a run can say it without asking again (stage 47). */
export const VISIBILITY_PATH = join(CACHE_DIR, "subject-visibility.json");

const tracked = (p: Project, exec: Exec) => exec("git", ["ls-files", "--error-unmatch", "--", COMPONENT_PATH], p.root) !== undefined;

const privateWarning = (slug: string, visibility: string) =>
  `the subject ${slug} is ${visibility.toLowerCase()}: a profile for it should not be committed to a public repository; keep it out of git with .git/info/exclude (docs/guides/manifest.md)`;

/** The local-path warning alone: cheap, so said on every run. */
export function localPathWarning(p: Project, exec: Exec = defaultExec): string | undefined {
  const repo = p.component?.manifest.subject?.repo;
  if (repo === undefined || !isPathRepo(repo)) return undefined;
  if (!tracked(p, exec)) return undefined;
  return `subject.repo is the local path ${repo} in a committed ${COMPONENT_PATH}: the profile works only on this machine; name the repository by its URL`;
}

/** Every warning about the subject: the local path, and whether GitHub says the repository is private. */
export function subjectWarnings(p: Project, exec: Exec = defaultExec): string[] {
  const out: string[] = [];
  const local = localPathWarning(p, exec);
  if (local !== undefined) out.push(local);
  const repo = p.component?.manifest.subject?.repo ?? "";
  // A local path is asked for its own origin: the checkout of a private repository is as private (stage 46).
  const origin = repo !== "" && isPathRepo(repo) ? exec("git", ["remote", "get-url", "origin"], resolve(p.root, repo))?.trim() : undefined;
  const slug = githubSlug(origin ?? repo);
  const visibility = slug === undefined ? undefined : exec("gh", ["repo", "view", slug, "--json", "visibility", "--jq", ".visibility"])?.trim();
  if (slug !== undefined && visibility !== undefined && visibility !== "") {
    try {
      const file = join(p.root, VISIBILITY_PATH);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify({ repo, slug, visibility })}\n`);
    } catch {
      // Only a later run's warning is lost.
    }
  }
  if (slug !== undefined && (visibility === "PRIVATE" || visibility === "INTERNAL")) out.push(privateWarning(slug, visibility));
  return out;
}

/**
 * The warnings a run says (stage 47): the local path, and a private subject, but only while the manifest is tracked,
 * which is when committing it would publish the profile. Visibility is what the last `csh subject fetch` recorded: a run
 * never asks GitHub.
 */
export function runWarnings(p: Project, exec: Exec = defaultExec): string[] {
  const out: string[] = [];
  const local = localPathWarning(p, exec);
  if (local !== undefined) out.push(local);
  const repo = p.component?.manifest.subject?.repo;
  const file = join(p.root, VISIBILITY_PATH);
  if (repo === undefined || !existsSync(file)) return out;
  try {
    const v = JSON.parse(readFileSync(file, "utf8")) as { repo?: string; slug?: string; visibility?: string };
    if (v.repo === repo && v.slug !== undefined && (v.visibility === "PRIVATE" || v.visibility === "INTERNAL") && tracked(p, exec)) out.push(privateWarning(v.slug, v.visibility));
  } catch {
    // An unreadable record says nothing.
  }
  return out;
}
