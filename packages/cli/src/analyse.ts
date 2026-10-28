// csh analyse (Analyse, danger and grain, section 2; stage 55): read a repository cold and write the analysis. Exits 0
// when the analysis completes, whatever it found; 1 when the repository cannot be read; 2 on a usage error.
// With --expected, the analysis is compared with that csh-expected/v1 file (stage 60), and a mismatch exits 1.
import { writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { analysisSheet, renderStartHere, sheetFiles } from "@csh/a3";
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
    io.err("usage: csh analyse <path> [--at <commit>] [--json] [--out <dir>] [--profile <dir>] [--expected <file>] [--budget ms]\n");
    return 2;
  }
  const r = await analyse({
    path: resolve(io.cwd, path),
    solver: await solver(),
    ...(a.options.at !== undefined ? { at: a.options.at } : {}),
    ...(a.options.profile !== undefined ? { profile: resolve(io.cwd, a.options.profile) } : {}),
    ...(a.options.expected !== undefined ? { expected: resolve(io.cwd, a.options.expected) } : {}),
    ...(a.options.budget !== undefined ? { budgetMs: Number(a.options.budget) } : {}),
  });
  if (!r.ok) {
    io.err(`csh analyse: ${r.message}\n`);
    return 1;
  }
  const out = a.options.out ?? "reports";
  const dir = isAbsolute(out) ? out : resolve(io.cwd, out);
  const files = writeAnalysis(dir, r.analysis);
  // The A3 beside the analysis (The analysis A3 and 1.0, section 1): read from the analysis alone.
  const sheet = analysisSheet(r.analysis);
  for (const [name, text] of Object.entries(sheetFiles(sheet))) writeFileSync(join(dir, name), text);
  const shown = (p: string) => (relative(io.cwd, p) || p).replace(/\\/g, "/");
  if (a.flags.has("json")) io.out(stableJson(r.analysis));
  else io.out(`${renderAnalysis(r.analysis)}\nwrote ${shown(files.html)} and ${shown(files.json)}, and the A3 as ${shown(join(dir, "csh-a3.html"))}, ${shown(join(dir, "csh-a3.md"))} and ${shown(join(dir, "csh-a3.json"))}\n\n${renderStartHere(sheet, shown(join(dir, "csh-a3.html")))}`);
  if (a.options.expected !== undefined && (r.analysis.expect?.mismatches.length ?? 0) > 0) {
    io.err(`csh analyse: the analysis does not meet ${a.options.expected}:\n${r.analysis.expect!.mismatches.map((m) => `  ${m.row !== undefined ? `row ${m.row}: ` : ""}${m.message}\n`).join("")}`);
    return 1;
  }
  return 0;
}
