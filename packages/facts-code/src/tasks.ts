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

const STRING_OR_COMMENT = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
const STRING = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`/y;

/** The value of a string literal's body, its escapes decoded. */
function unescape(body: string): string {
  const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" };
  return body.replace(/\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|\r?\n|([\s\S]))/g, (_, cp, u, x, c) =>
    cp !== undefined || u !== undefined || x !== undefined
      ? String.fromCodePoint(parseInt(cp ?? u ?? x, 16))
      : c === undefined
        ? ""
        : (simple[c] ?? c),
  );
}

/** The arguments of each `task(...)` call in `text`, comments already removed: up to the parenthesis that closes it. */
function taskCalls(text: string): string[] {
  const calls: string[] = [];
  for (const m of text.matchAll(/(?<![\w$.])task\s*\(/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < text.length && depth > 0) {
      STRING.lastIndex = i;
      const literal = STRING.exec(text);
      if (literal !== null) {
        i += literal[0].length;
        continue;
      }
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
      i++;
    }
    calls.push(text.slice(m.index + m[0].length, i - 1));
  }
  return calls;
}

/**
 * A hereby file's tasks: each `name` property of a `task(...)` call whose whole value is a string literal. Any other
 * `name` property of a call (a shorthand `name,`, a variable, a template with `${`, or a literal joined to more), or a
 * file with no call at all, opens the set. Comments are not read.
 */
export function herebyTasks(text: string): string[] {
  const code = text.replace(STRING_OR_COMMENT, (_, literal: string | undefined) => literal ?? " ");
  const calls = taskCalls(code);
  const names: string[] = [];
  let open = calls.length === 0;
  for (const call of calls) {
    const literals: string[] = [];
    const bare = call.replace(new RegExp(STRING.source, "g"), (literal) => `\0${literals.push(literal) - 1}\0`);
    for (const m of bare.matchAll(/(?<![\w$.])name\s*(?::\s*\0(\d+)\0(?=\s*(?:[,}]|$))|[:,}]|$)/g)) {
      const literal = m[1] === undefined ? undefined : literals[Number(m[1])]!;
      if (literal === undefined || (literal.startsWith("`") && literal.includes("${"))) open = true;
      else names.push(unescape(literal.slice(1, -1)));
    }
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

/**
 * A justfile's recipes and aliases. A recipe's attributes (`[private]`) are not part of its name. An import
 * (`import 'x.just'`), a module (`mod x`) or an include opens the set.
 */
export function justRecipes(text: string): string[] {
  const names: string[] = [];
  let open = false;
  for (const line of text.split(/\r?\n/)) {
    const raw = line.replace(/^(?:\[[^\]]*\]\s*)+/, "");
    if (/^import\??\s+['"]|^mod\??\s+[A-Za-z_]|^!include\s/.test(raw)) {
      open = true;
      continue;
    }
    const alias = /^alias\s+([A-Za-z_][\w-]*)\s*:=/.exec(raw);
    if (alias !== null) {
      names.push(alias[1]!);
      continue;
    }
    if (/^(?:set|export)\s/.test(raw)) continue;
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
