// Process and safety (From real runs, stage 44): a profile names a subject repository, and committing it says where that
// repository is. Two warnings, neither of which stops anything: a subject that is private, asked of `gh` when it is
// installed, since its profile should not be committed to a public repository; and a committed manifest that names its
// subject by a local path, which works only on the machine that wrote it.
import { execFileSync } from "node:child_process";
import { COMPONENT_PATH } from "@csh/component";
import type { Project } from "./project.ts";

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

/** The local-path warning alone: cheap, so said on every run. */
export function localPathWarning(p: Project, exec: Exec = defaultExec): string | undefined {
  const repo = p.component?.manifest.subject?.repo;
  if (repo === undefined || !isPathRepo(repo)) return undefined;
  if (exec("git", ["ls-files", "--error-unmatch", "--", COMPONENT_PATH], p.root) === undefined) return undefined;
  return `subject.repo is the local path ${repo} in a committed ${COMPONENT_PATH}: the profile works only on this machine; name the repository by its URL`;
}

/** Every warning about the subject: the local path, and whether GitHub says the repository is private. */
export function subjectWarnings(p: Project, exec: Exec = defaultExec): string[] {
  const out: string[] = [];
  const local = localPathWarning(p, exec);
  if (local !== undefined) out.push(local);
  const slug = githubSlug(p.component?.manifest.subject?.repo ?? "");
  const visibility = slug === undefined ? undefined : exec("gh", ["repo", "view", slug, "--json", "visibility", "--jq", ".visibility"])?.trim();
  if (visibility === "PRIVATE" || visibility === "INTERNAL") {
    out.push(`the subject ${slug} is ${visibility.toLowerCase()}: a profile for it should not be committed to a public repository; keep it out of git with .git/info/exclude (docs/guides/manifest.md)`);
  }
  return out;
}
