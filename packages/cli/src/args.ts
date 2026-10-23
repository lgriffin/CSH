// A small argument parser: positionals, --key value options and --flags, and the checks each command makes of them.
export interface Args {
  positional: string[];
  options: Record<string, string>;
  flags: Set<string>;
  /** Malformed options: an empty value (--out=), a value for a flag (--json=yes), an option given twice. */
  errors: string[];
}

const FLAGS = new Set(["json", "no-cache", "help", "version", "force-nondeterminism", "check"]);

/**
 * Parse an argument vector. `--` ends the options: what follows is positional. `-h` is `--help`. A flag given a value
 * (`--json=yes`), an option given an empty one (`--out=`) and an option given twice are errors, never a silent pick.
 * An option with no value after it lands among the flags; argProblems names it as an option missing its value.
 */
export function parseArgs(argv: string[]): Args {
  const a: Args = { positional: [], options: {}, flags: new Set(), errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]!;
    if (x === "--") {
      a.positional.push(...argv.slice(i + 1));
      break;
    }
    if (x === "-h") a.flags.add("help");
    else if (x.startsWith("--")) {
      const eq = x.indexOf("=");
      const k = eq < 0 ? x.slice(2) : x.slice(2, eq);
      const inline = eq < 0 ? undefined : x.slice(eq + 1);
      if (FLAGS.has(k)) {
        if (inline !== undefined) a.errors.push(`--${k} takes no value`);
        else a.flags.add(k);
        continue;
      }
      let value: string | undefined;
      if (inline !== undefined) value = inline;
      else if (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) value = argv[++i]!;
      // An option with no value is kept as a flag, so that argProblems can tell a misspelt flag (--josn) from an
      // option missing its value (--out at the end), which only the command knows.
      if (value === undefined) a.flags.add(k);
      else if (value === "") a.errors.push(`--${k} needs a value`);
      else if (k in a.options) a.errors.push(`--${k} is given twice`);
      else a.options[k] = value;
    } else a.positional.push(x);
  }
  return a;
}

/** What a command accepts besides the options every command takes. */
export interface Accepts {
  options?: readonly string[];
  flags?: readonly string[];
  /** The least and most positional arguments after the command's name. */
  positional: readonly [number, number];
}

/** Accepted by every command. */
export const COMMON_OPTIONS: readonly string[] = ["root", "subject"];
// --version is asked of csh itself (csh --version), never of a command, so a command refuses it.
const COMMON_FLAGS: readonly string[] = ["help"];

/**
 * The problems with arguments a command does not accept: an unknown option or flag, named with the nearest one it does
 * accept, and too few or too many positionals. Values are checked by `valueProblems`.
 */
export function argProblems(a: Args, accepts: Accepts): string[] {
  const options = [...COMMON_OPTIONS, ...(accepts.options ?? [])];
  const flags = [...COMMON_FLAGS, ...(accepts.flags ?? [])];
  const problems: string[] = [];
  for (const k of Object.keys(a.options)) {
    if (options.includes(k)) continue;
    problems.push(flags.includes(k) ? `--${k} takes no value` : `unknown option --${k}${hint(k, [...options, ...flags])}`);
  }
  for (const k of a.flags) {
    if (flags.includes(k)) continue;
    problems.push(options.includes(k) ? `--${k} needs a value` : `unknown option --${k}${hint(k, [...options, ...flags])}`);
  }
  const [min, max] = accepts.positional;
  if (a.positional.length < min) problems.push(`expects ${min === max ? min : `at least ${min}`} argument${min === 1 ? "" : "s"}, and has ${a.positional.length}`);
  else if (a.positional.length > max) problems.push(max === 0 ? `takes no arguments, and has ${a.positional.map((x) => JSON.stringify(x)).join(" ")}` : `takes at most ${max} argument${max === 1 ? "" : "s"}; ${a.positional.slice(max).map((x) => JSON.stringify(x)).join(" ")} ${a.positional.length - max === 1 ? "is" : "are"} extra`);
  return problems;
}

/** The problems with the values of options whose form is fixed: a budget, a gate mode, a date. */
export function valueProblems(a: Args): string[] {
  const problems: string[] = [];
  const budget = a.options.budget;
  if (budget !== undefined && !(/^[1-9][0-9]*$/.test(budget) && Number.isSafeInteger(Number(budget)))) problems.push(`--budget is a whole number of milliseconds above 0, not ${JSON.stringify(budget)}`);
  const mode = a.options.mode;
  if (mode !== undefined && mode !== "advisory" && mode !== "enforcing") problems.push(`--mode is advisory or enforcing, not ${JSON.stringify(mode)}`);
  return problems;
}

/** "; did you mean --x?" when one candidate is within two edits of the word, else nothing. */
export function hint(word: string, candidates: readonly string[], prefix = "--"): string {
  const near = nearest(word, candidates);
  return near === undefined ? "" : `; did you mean ${prefix}${near}?`;
}

/** The candidate within two edits of the word (or one, for words of three letters or fewer), the closest first. */
export function nearest(word: string, candidates: readonly string[]): string | undefined {
  const limit = word.length <= 3 ? 1 : 2;
  let best: { c: string; d: number } | undefined;
  for (const c of candidates) {
    const d = distance(word, c);
    if (d <= limit && (best === undefined || d < best.d)) best = { c, d };
  }
  return best?.c;
}

/** Edit distance, a swap of two neighbouring letters counting as one edit (optimal string alignment). */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}
