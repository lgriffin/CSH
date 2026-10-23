// The tasks of a task runner (Symbols in prose, and task runners, section 2; stage 68): hereby's tasks, make's targets
// and just's recipes, read from the text of the runner's file at the repository's root, never run. Where the text may
// not show every task, a task named "*" says the set is open.
import type { Fact, TaskFact } from "@csh/witness";
import type { FactContext, InputFile } from "./run.ts";

export const TOOL = { id: "facts-code", version: "0.1.0" } as const;

/** The runner a file at the root belongs to, by its name. */
export function runnerOf(path: string): TaskFact["runner"] | undefined {
  if (/^Herebyfile\.(?:js|mjs|cjs|ts|mts)$/.test(path)) return "hereby";
  if (/^(?:Makefile|makefile|GNUmakefile)$/.test(path)) return "make";
  if (/^(?:justfile|Justfile|\.justfile)$/.test(path)) return "just";
  return undefined;
}

/** A hereby file's tasks: each `name` property written as a string literal; any other `name` property opens the set. */
export function herebyTasks(text: string): string[] {
  const names: string[] = [];
  let open = false;
  for (const m of text.matchAll(/(?<![\w$.])name\s*(:\s*(?:"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`\\$]*)`|)|[,}])/g)) {
    const literal = m[2] ?? m[3] ?? m[4];
    if (literal !== undefined) names.push(literal);
    else open = true;
  }
  return open ? [...names, "*"] : names;
}

/**
 * A makefile's targets: the targets of each rule line, one starting with no tab whose first `:` is not part of `:=` or
 * `::=`. A target starting with `.` is special. A pattern or a variable among the targets, or an include, opens the set.
 */
export function makeTargets(text: string): string[] {
  const names: string[] = [];
  let open = false;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith("\t") || /^\s*#/.test(raw)) continue;
    if (/^\s*-?(?:include|sinclude)\s/.test(raw)) {
      open = true;
      continue;
    }
    const rule = /^([^:=#]+?)\s*::?(?![:=])/.exec(raw);
    if (rule === null || /^\s*(?:export|override|define|endef|ifn?eq|ifn?def|else|endif)\b/.test(raw)) continue;
    for (const t of rule[1]!.trim().split(/\s+/)) {
      if (t.startsWith(".")) continue;
      if (/[%$]/.test(t)) open = true;
      else names.push(t);
    }
  }
  return open ? [...names, "*"] : names;
}

/** A justfile's recipes and aliases. An import, a module or an include opens the set. */
export function justRecipes(text: string): string[] {
  const names: string[] = [];
  let open = false;
  for (const raw of text.split(/\r?\n/)) {
    if (/^(?:import|mod)\b|^!include\b/.test(raw)) {
      open = true;
      continue;
    }
    const alias = /^alias\s+([A-Za-z_][\w-]*)\s*:=/.exec(raw);
    if (alias !== null) {
      names.push(alias[1]!);
      continue;
    }
    if (/^(?:set|export)\b/.test(raw)) continue;
    const recipe = /^@?([A-Za-z_][\w-]*)(?:\s+[^:]*)?:(?!=)/.exec(raw);
    if (recipe !== null) names.push(recipe[1]!);
  }
  return open ? [...names, "*"] : names;
}

/** The task facts of the runner files among `files`: only those at the repository's root. */
export function taskFacts(files: readonly InputFile[], ctx: FactContext): Fact[] {
  const facts: Fact[] = [];
  for (const f of files) {
    const runner = runnerOf(f.path);
    if (runner === undefined) continue;
    const text = new TextDecoder().decode(f.bytes);
    const names = runner === "hereby" ? herebyTasks(text) : runner === "make" ? makeTargets(text) : justRecipes(text);
    for (const name of [...new Set(names)]) facts.push({ ...ctx.base(TOOL), kind: "task", at: f.path, runner, file: f.path, name });
  }
  return facts;
}
