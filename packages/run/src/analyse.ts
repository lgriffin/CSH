// csh analyse (Analyse, danger and grain, section 2; stage 55): one command that reads a repository cold. It proposes a
// profile, lifting told rules from the repository's own prose, or reads the profile given; evaluates one commit of a
// private clone of the repository; and returns the analysis. It never runs the subject's tests or build, never writes
// into the subject, never reads a ledger or a key, and approves nothing.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type Analysis, checkExpected, overviewOf, parseExpected, renderAnalysisHtml, type Report } from "@csh/check";
import { COMPONENT_PATH } from "@csh/component";
import { stableJson } from "@csh/kernel";
import type { SolverPort } from "@csh/solver";
import { coverageOfSources } from "./coverage.ts";
import { evaluateProject } from "./evaluate.ts";
import { loadProject, type Project } from "./project.ts";
import { proposeProfile } from "./propose.ts";

export interface AnalyseOptions {
  /** The repository to read: a git checkout, or a directory inside one. */
  path: string;
  /** A commit (or tag) of it to read instead of HEAD. */
  at?: string;
  /** A component root whose csh/component.json names the subject, read instead of a proposal. */
  profile?: string;
  /**
   * A csh-expected/v1 file the analysis is compared with (stage 60), whichever profile it read: the expected results of a
   * cold read, kept outside the repository. Without it, a given profile's own csh/expected.json is used when present.
   */
  expected?: string;
  solver: SolverPort;
  budgetMs?: number;
}

export type AnalyseResult = { ok: true; analysis: Analysis; report: Report } | { ok: false; message: string };

/** A remote URL with any user name and password removed, so that a token in a clone's origin never reaches a report. */
export function withoutCredentials(url: string | undefined): string | undefined {
  if (url === undefined || !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  try {
    const u = new URL(url);
    if (u.username === "" && u.password === "") return url;
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return url.replace(/\/\/[^/@]*@/, "//");
  }
}

const git = (dir: string, ...args: string[]): string => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (dir: string, ...args: string[]): string | undefined => {
  try {
    return git(dir, ...args);
  } catch {
    return undefined;
  }
};

/** The practice that owns each source, for placing overview entries. */
const practiceMap = (p: Project) => (p.component !== undefined ? { sources: Object.fromEntries(p.component.manifest.practices.flatMap((x) => x.sources.map((s) => [s, x.id]))) } : undefined);

/** Make `csl` resolvable from a clone, so that a profile beside the subject can be emitted there. */
function linkCsl(root: string): void {
  try {
    let pkg = dirname(createRequire(import.meta.url).resolve("csl"));
    while (!existsSync(join(pkg, "package.json")) && dirname(pkg) !== pkg) pkg = dirname(pkg);
    const dir = join(root, "node_modules");
    if (existsSync(join(dir, "csl"))) return;
    mkdirSync(dir, { recursive: true });
    symlinkSync(pkg, join(dir, "csl"), "junction");
  } catch {
    // The profile then fails to emit, and says why.
  }
}

export async function analyse(o: AnalyseOptions): Promise<AnalyseResult> {
  const top = tryGit(resolve(o.path), "rev-parse", "--show-toplevel");
  if (top === undefined) return { ok: false, message: `${o.path} is not inside a git checkout` };
  const commit = tryGit(top, "rev-parse", "--verify", `${o.at ?? "HEAD"}^{commit}`);
  if (commit === undefined) return { ok: false, message: o.at === undefined ? `${top} has no commit to read` : `${o.at} is not a commit of ${top}` };
  const origin = withoutCredentials(tryGit(top, "remote", "get-url", "origin"));
  const repo = origin === undefined || origin === "" ? top : origin;
  const work = mkdtempSync(join(tmpdir(), "csh-analyse-"));
  try {
    // A private clone at the commit: the subject's own objects, shared read-only, and nothing written beside them.
    const clone = join(work, "subject");
    git(work, "clone", "--quiet", "--shared", "--no-checkout", top, clone);
    git(clone, "checkout", "--quiet", "--detach", commit);
    const beside = existsSync(join(clone, COMPONENT_PATH));
    let p: Project;
    let analysisProfile: Analysis["profile"];
    let guesses: string[] = [];
    if (o.profile !== undefined) {
      const root = resolve(o.profile);
      const file = join(root, COMPONENT_PATH);
      if (!existsSync(file)) return { ok: false, message: `${root} has no ${COMPONENT_PATH}` };
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(file, "utf8"));
      } catch (err) {
        return { ok: false, message: `${file} is not JSON: ${(err as Error).message}` };
      }
      if (typeof raw !== "object" || raw === null || !("subject" in raw)) return { ok: false, message: `${file} names no subject: a profile of the repository itself sits beside it, in its csh/ directory` };
      p = loadProject(root, root, { subject: clone, subjectCommit: commit });
      analysisProfile = { kind: "given", dir: root };
    } else if (beside) {
      const names = (() => {
        try {
          return "subject" in (JSON.parse(readFileSync(join(clone, COMPONENT_PATH), "utf8")) as object);
        } catch {
          return false;
        }
      })();
      if (names) {
        // A profile beside the subject that names a subject reads the clone, from a copy of its csh/ directory, so that
        // the clone stays exactly as its commit holds it.
        const root = join(work, "root");
        cpSync(join(clone, "csh"), join(root, "csh"), { recursive: true });
        linkCsl(root);
        p = loadProject(root, root, { subject: clone, subjectCommit: commit });
      } else {
        linkCsl(clone);
        p = loadProject(clone, clone);
      }
      analysisProfile = { kind: "given", dir: join(top, "csh") };
    } else {
      const proposal = proposeProfile(clone, { lift: true });
      if ("error" in proposal) return { ok: false, message: proposal.error };
      proposal.manifest.subject = { repo, commit };
      guesses = proposal.guesses.map((g) => (g.startsWith("subject.repo ") ? `subject.repo ${repo}: ${origin === undefined || origin === "" ? "the checkout has no origin remote, so the repository is named by its path" : "the checkout's origin remote"}; subject.commit ${commit}` : g));
      const root = join(work, "root");
      mkdirSync(join(root, "csh"), { recursive: true });
      writeFileSync(join(root, COMPONENT_PATH), stableJson(proposal.manifest));
      p = loadProject(root, root, { subject: clone, subjectCommit: commit });
      analysisProfile = { kind: "proposed" };
    }
    if (p.componentProblems.length > 0) return { ok: false, message: `the profile cannot be used: ${p.componentProblems.map((x) => `${x.code}: ${x.detail}`).join("; ")}` };
    const e = await evaluateProject(p, { solver: o.solver, noCache: true, ledger: false, ...(o.budgetMs !== undefined ? { budgetMs: o.budgetMs } : {}) });
    if (!e.ok) return { ok: false, message: e.message.trimEnd() };
    const report = e.report;
    const overview = overviewOf(report, practiceMap(p));
    const sources = p.component?.manifest.sources ?? [];
    const c = sources.length > 0 ? coverageOfSources(clone, sources) : undefined;
    const told = report.items.flatMap((i) => (i.attrs?.lifted !== undefined ? [{ item: `${i.source}/${i.id}`, lifted: i.attrs.lifted, span: i.span, text: i.attrs.sentence ?? "" }] : []));
    const analysis: Analysis = {
      schema: "csh-analysis/v1",
      subject: { path: top, repo, commit },
      profile: analysisProfile,
      guesses,
      ...(c !== undefined ? { coverage: { tracked: c.tracked, read: c.read, ...(c.byName > 0 ? { byName: c.byName } : {}), eligible: c.eligible, unread: c.unread, skipped: c.skipped, missed: c.missed } } : {}),
      told,
      overview,
    };
    const expectedFile = o.expected !== undefined ? resolve(o.expected) : analysisProfile.kind === "given" ? (o.profile !== undefined ? join(resolve(o.profile), "csh", "expected.json") : join(clone, "csh", "expected.json")) : undefined;
    if (expectedFile !== undefined && existsSync(expectedFile)) {
      const parsed = parseExpected(readFileSync(expectedFile, "utf8"));
      if (parsed.expected !== undefined) analysis.expect = checkExpected(overview, parsed.expected);
      else if (o.expected !== undefined) return { ok: false, message: `${o.expected}: ${parsed.problems.join("; ")}` };
    } else if (o.expected !== undefined) return { ok: false, message: `${o.expected} does not exist` };
    return { ok: true, analysis, report };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Write the analysis as csh-analysis.json and csh-analysis.html in `dir`; returns the two paths. */
export function writeAnalysis(dir: string, a: Analysis): { json: string; html: string } {
  mkdirSync(dir, { recursive: true });
  const json = join(dir, "csh-analysis.json");
  const html = join(dir, "csh-analysis.html");
  writeFileSync(json, stableJson(a));
  const name = a.subject.repo.replace(/\.git$/, "").split(/[/:\\]/).filter((x) => x !== "").pop() ?? "repository";
  writeFileSync(html, renderAnalysisHtml(a, `CSH analysis of ${name} at ${a.subject.commit.slice(0, 12)}`));
  return { json, html };
}
