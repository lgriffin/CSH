// csh diff <base> <head> (Next layers, section 5): what a change did to the results of one component. Each side is a
// stored run's directory or a commit; a commit with no stored run is run at that commit, and one that cannot be run is
// unavailable, never an empty diff (A-77). The diff reads and never decides: it exits 0 whenever it could be made.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stableJson } from "@csh/kernel";
import { diffProject, renderDiff } from "@csh/review";
import type { Project, RunOptions } from "@csh/run";
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

export async function diffCommand(p: Project, a: Args, io: DiffIo): Promise<number> {
  const [baseArg, headArg] = a.positional;
  if (baseArg === undefined || headArg === undefined) {
    io.err("usage: csh diff <base> <head> [--json] [--out <dir>]   (each a stored run's directory, a commit, or . for the working tree)\n");
    return 2;
  }
  const d = await diffProject(p, baseArg, headArg, { ...io, note: io.err });
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
