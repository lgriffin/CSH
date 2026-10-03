// A small argument parser: positionals, --key value options and --flags.
export interface Args {
  positional: string[];
  options: Record<string, string>;
  flags: Set<string>;
  /** Options given without the value they need, such as a trailing --out. */
  errors: string[];
}

const FLAGS = new Set(["json", "no-cache", "help", "force-nondeterminism", "check"]);

export function parseArgs(argv: string[]): Args {
  const a: Args = { positional: [], options: {}, flags: new Set(), errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]!;
    if (x.startsWith("--")) {
      const [k, inline] = x.slice(2).split("=", 2) as [string, string | undefined];
      if (inline !== undefined) a.options[k] = inline;
      else if (FLAGS.has(k)) a.flags.add(k);
      else if (i + 1 >= argv.length || argv[i + 1]!.startsWith("--")) a.errors.push(`--${k} needs a value`);
      else a.options[k] = argv[++i]!;
    } else a.positional.push(x);
  }
  return a;
}
