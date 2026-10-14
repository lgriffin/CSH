// csh analyse (Analyse, danger and grain, section 2; stage 55): read a repository cold and write the analysis. Exits 0
// when the analysis completes, whatever it found; 1 when the repository cannot be read; 2 on a usage error.
import { isAbsolute, relative, resolve } from "node:path";
import { renderAnalysis } from "@csh/check";
import { stableJson } from "@csh/kernel";
import type { SolverPort } from "@csh/solver";
import { analyse, writeAnalysis } from "@csh/run";
import type { Args } from "./args.ts";

interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  cwd: string;
}

export async function analyseCommand(a: Args, io: Io, solver: () => Promise<SolverPort>): Promise<number> {
  const path = a.positional[0];
  if (path === undefined || a.positional.length > 1) {
    io.err("usage: csh analyse <path> [--at <commit>] [--json] [--out <dir>] [--profile <dir>] [--budget ms]\n");
    return 2;
  }
  const r = await analyse({
    path: resolve(io.cwd, path),
    solver: await solver(),
    ...(a.options.at !== undefined ? { at: a.options.at } : {}),
    ...(a.options.profile !== undefined ? { profile: resolve(io.cwd, a.options.profile) } : {}),
    ...(a.options.budget !== undefined ? { budgetMs: Number(a.options.budget) } : {}),
  });
  if (!r.ok) {
    io.err(`csh analyse: ${r.message}\n`);
    return 1;
  }
  const out = a.options.out ?? "reports";
  const files = writeAnalysis(isAbsolute(out) ? out : resolve(io.cwd, out), r.analysis);
  const shown = (p: string) => (relative(io.cwd, p) || p).replace(/\\/g, "/");
  if (a.flags.has("json")) io.out(stableJson(r.analysis));
  else io.out(`${renderAnalysis(r.analysis)}\nwrote ${shown(files.html)} and ${shown(files.json)}\n`);
  return 0;
}
