// Importing a runner's report (Ingesting a codebase, stage 28): the report reduced to what CSH reads of it, written
// where the practice reads its results, so a subject's results can be committed without its test names.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { stableJson } from "@csh/kernel";
import { reduceTestResults } from "@csh/witness";
import type { Project } from "./project.ts";

/** The identifiers a test name may cite when the practice says nothing: the tests adapter's default. */
const DEFAULT_CITE = "[A-Z][A-Z0-9]*-[0-9]+";

export type ImportResults = { ok: true; path: string; files: number; tests: number; cited: number } | { ok: false; message: string };

/**
 * Reduce the runner's report at `report` and write it to the practice's `executions` path, naming the commit the
 * subject is pinned to, if any. Paths are made relative to `base`; an absolute path left over is refused, since a
 * path from the machine the tests ran on is joined to no test file and says where they ran.
 */
export function importResults(p: Project, practiceId: string, report: string, base?: string): ImportResults {
  const practice = p.component?.manifest.practices.find((x) => x.id === practiceId);
  if (practice === undefined) return { ok: false, message: `no practice ${practiceId} in the component manifest` };
  if (practice.executions === undefined) return { ok: false, message: `practice ${practiceId} names no executions file to write` };
  let text: string;
  try {
    text = readFileSync(report, "utf8");
  } catch (err) {
    return { ok: false, message: `cannot read ${report}: ${(err as Error).message}` };
  }
  const settings = practice.settings ?? {};
  // A scenario's result cites what its tags name, as the scenarios practice reads a tag (stage 42).
  const scenario = practice.kind === "scenarios" ? [settings.idTag, settings.tagCites, settings.idPattern].filter((x) => x !== undefined) : [];
  const cite = new RegExp(`\\b(?:${scenario.length > 0 ? scenario.join("|") : (settings.citePattern ?? settings.idPattern ?? DEFAULT_CITE)})\\b`, "g");
  // A subject's results are of its pinned commit, whether or not it is checked out yet. A project's own results name no
  // commit: importing and committing them moves HEAD past any commit they could name, so they would never be joined.
  const commit = p.component?.manifest.subject?.commit;
  const { reduced, problems } = reduceTestResults(text, { cite, ...(base !== undefined ? { base: isAbsolute(base) ? base : resolve(base) } : {}), ...(commit !== undefined ? { commit } : {}) });
  if (problems.length > 0) return { ok: false, message: `the report is malformed: ${problems[0]!.message}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ""}` };
  if (reduced.files.length === 0) return { ok: false, message: "the report holds no test file" };
  const absolute = reduced.files.find((f) => isAbsolute(f.file));
  if (absolute !== undefined) return { ok: false, message: "the report names test files by absolute path: pass --base <dir>, the directory the tests ran in" };
  const path = resolve(p.root, practice.executions);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stableJson(reduced));
  const count = (f: (typeof reduced.files)[number]) => f.passed + f.failed + f.errored + f.skipped + f.cited.length;
  return { ok: true, path, files: reduced.files.length, tests: reduced.files.reduce((a, f) => a + count(f), 0), cited: reduced.files.reduce((a, f) => a + f.cited.length, 0) };
}
