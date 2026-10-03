// A small argument parser: positionals, --key value options and --flags.
export interface Args {
  positional: string[];
  options: Record<string, string>;
  flags: Set<string>;
}

const FLAGS = new Set(["json", "no-cache", "help", "force-nondeterminism"]);

export function parseArgs(argv: string[]): Args {
  const a: Args = { positional: [], options: {}, flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]!;
    if (x.startsWith("--")) {
      const [k, inline] = x.slice(2).split("=", 2) as [string, string | undefined];
      if (inline !== undefined) a.options[k] = inline;
      else if (FLAGS.has(k) || i + 1 >= argv.length || argv[i + 1]!.startsWith("--")) a.flags.add(k);
      else a.options[k] = argv[++i]!;
    } else a.positional.push(x);
  }
  return a;
}
