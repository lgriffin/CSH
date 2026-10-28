// What each csh command accepts and how it is described: one table, read by csh help, by the usage line printed with
// each usage error, and by the check of every command's arguments before it runs (stage 64).
import { readFileSync } from "node:fs";
import type { Accepts } from "./args.ts";

export interface Command extends Accepts {
  /** The names it answers to: approve, reject and retire share one entry. */
  names: readonly string[];
  /** What each subcommand takes, its name counted among the positionals; the command's own fields are their union. */
  subcommands?: Readonly<Record<string, Accepts>>;
  /** Its lines in csh help, each synopsis at two spaces and its description at column 35. */
  help: string;
}

const RUN_OPTIONS = ["budget"] as const;
const DECIDE = { options: ["actor", "rationale", ...RUN_OPTIONS], flags: ["no-cache"] } as const;

export const COMMANDS: readonly Command[] = [
  {
    names: ["init"],
    positional: [0, 0],
    help: `  csh init                        Write csh/component.json by asking for each field. Guesses nothing. Writes under
                                  the same root as every other command: --root, or the git top level.
  csh init --subject <dir>        Propose csh/component.json from a checkout's tracked files: sources by directory and
                                  extension, an identifier pattern, tag and test settings, a results file. Prints
                                  every guess and what the proposal leaves unread.`,
  },
  {
    names: ["analyse"],
    options: ["at", "out", "profile", "expected", "labels", "budget"],
    flags: ["json"],
    positional: [1, 1],
    help: `  csh analyse <path> [--at <commit>] [--json] [--out <dir>] [--profile <dir>] [--expected <file>]
              [--labels <file>] [--budget ms]
                                  Read a repository cold: propose a profile, lift the layering and EARS sentences of
                                  its documents as told rules, read its code and tests, check, and place every result,
                                  danger first, then conflicts, gaps, indeterminate and converged. Writes
                                  csh-analysis.html and .json under --out (reports), and beside them the A3
                                  (csh-a3.html, .md and .json), ending with where to start. With --labels, a
                                  person's csh-labels/v1 labels of the open entries, it reports precision by kind.
                                  Never writes into the repository, runs its tests or reads a ledger. Exits 0 when
                                  it completes; 1 when the analysis does not meet the --expected csh-expected/v1
                                  file, or an open entry is unlabelled, a label names no entry, or a refuted entry is
                                  labelled false.`,
  },
  {
    names: ["run"],
    options: ["at", "mode", "budget"],
    flags: ["no-cache"],
    positional: [0, 0],
    help: `  csh run [--at <commit>] [--mode advisory|enforcing] [--budget ms] [--no-cache]
                                  Run each practice's harness, check and gate one snapshot of the component, and
                                  store the run under .csh-cache/runs/. Exits 1 only on block in enforcing mode, or
                                  when the run could not be made; 3 when a past commit needs other dependencies.`,
  },
  {
    names: ["check"],
    options: ["out", "budget"],
    flags: ["json", "no-cache"],
    positional: [0, 1],
    help: `  csh check [spec] [--out report.json] [--json] [--budget ms] [--no-cache]
                                  Run every check and write the report. Exits 0 when the run completed.`,
  },
  {
    names: ["gaps"],
    options: ["budget"],
    flags: ["no-cache"],
    positional: [0, 1],
    help: "  csh gaps [spec]                 Print the gap view only.",
  },
  {
    names: ["coverage"],
    flags: ["json"],
    positional: [0, 0],
    help: "  csh coverage [--json]           What each source reads, what is skipped and why, and the eligible files no source reads.",
  },
  {
    names: ["overview"],
    options: ["run", "signal", "out", "report"],
    flags: ["json"],
    positional: [0, 0],
    help: `  csh overview [--run <dir|commit>] [--signal <id>] [--out <file>] [--json]
                                  Place every result of the last report in one of three outcomes: gaps (suggestions,
                                  with what would close each), indeterminate (with what would decide it) and
                                  converged. Prints the counts by practice and kind and writes the sheet to
                                  reports/csh-overview.html, which opens on any signal as #<id>. --signal prints one.`,
  },
  {
    names: ["ladder"],
    options: ["run", "report"],
    flags: ["json"],
    positional: [0, 0],
    help: `  csh ladder [--run <dir|commit>] [--json]
                                  Every told rule on the Assertion Ladder, weakest first: its rung (L2 told, L3
                                  checked, L4 explained, L5 prevented), the mechanisms that establish it, and the
                                  outcomes of the overview entries about it. Reads the last report; decides nothing.`,
  },
  {
    names: ["explain"],
    options: ["run", "report"],
    positional: [1, 1],
    help: `  csh explain <finding-id> [--run <dir|commit>]
                                  Print one finding, members rendered through the printer. With --run, from a stored
                                  run (its directory, or a commit whose newest stored run is read) rather than reports/.`,
  },
  {
    names: ["approve", "reject", "retire"],
    ...DECIDE,
    positional: [1, 1],
    help: `  csh approve <fragment> --actor <name> --rationale <text>
                                  A fragment, or #a3/<slug> for an A3's judgments.
  csh reject <fragment> --actor <name> --rationale <text>
  csh retire <fragment> --actor <name> --rationale <text>`,
  },
  {
    names: ["waive"],
    options: [...DECIDE.options, "scope", "expires"],
    flags: DECIDE.flags,
    positional: [1, 1],
    help: "  csh waive <fragment> --scope <finding-id|obligation> --expires <YYYY-MM-DD> --actor <name> --rationale <text>",
  },
  {
    names: ["countersign"],
    ...DECIDE,
    positional: [1, 1],
    help: `  csh countersign <seq> --actor <name> --rationale <text>
                                  Draft a ledger line. The tool never commits or signs: commit
                                  csh/ledger.ndjson alone, signed with your own key.`,
  },
  {
    names: ["status"],
    flags: ["json"],
    positional: [0, 0],
    help: `  csh status [--json]             What is and is not protected, for one component: the root of trust, the
                                  maintainers, what is approved, the gate mode and whether the stored decision is
                                  for the current snapshot. Reads only; always exits 0 when it can read the component.`,
  },
  {
    names: ["diff"],
    options: ["out", ...RUN_OPTIONS],
    flags: ["json", "no-cache"],
    positional: [2, 2],
    help: `  csh diff <base> <head> [--json] [--out <dir>]
                                  What a change did to the results: approvals lost, new violations, rules gone
                                  unknown, signals appeared and cleared, observations, counts. Each side is a stored
                                  run's directory, a commit (run when no run of it is stored) or . for the working
                                  tree. A side that cannot be run is unavailable, never an empty diff. Exits 0, or 1
                                  when the head cannot be run.`,
  },
  {
    names: ["queue"],
    flags: ["json"],
    positional: [0, 0],
    help: `  csh queue [--json]              What awaits the owner's decision: candidate rules, unapproved bindings and A3
                                  judgments, each with who wrote it, how long it has waited and what approving it
                                  would unlock. Warns past csh/config.json's queueLimit. Reads only; exits 0.`,
  },
  {
    names: ["gate"],
    options: ["mode", "out", "verify", ...RUN_OPTIONS],
    flags: ["no-cache"],
    positional: [0, 0],
    help: `  csh gate [--mode advisory|enforcing] [--out decision.json]
                                  Check and decide for the current snapshot. Exits 1 only on block in enforcing mode.
  csh gate --verify <decision.json>
                                  Recompute the decision; refuse (exit 3) one made for any other snapshot or that differs.`,
  },
  {
    names: ["a3"],
    options: ["at", "stage", "mode", ...RUN_OPTIONS],
    flags: ["check", "no-cache"],
    positional: [2, 3],
    subcommands: {
      open: { options: ["at", "stage", "mode", ...RUN_OPTIONS], flags: ["no-cache"], positional: [2, 2] },
      stage: { options: ["at", "mode", ...RUN_OPTIONS], flags: ["no-cache"], positional: [3, 3] },
      build: { flags: ["check"], positional: [2, 2] },
      verify: { options: [...RUN_OPTIONS], flags: ["no-cache"], positional: [2, 2] },
    },
    help: `  csh a3 open <slug> [--at <commit>] [--stage <id>]
                                  Record a run as an A3's first stage and write an empty judgments skeleton under
                                  csh/a3/<slug>/. Never overwrites judgments.
  csh a3 stage <slug> <id> --at <commit> [--mode advisory|enforcing]
                                  Record the run of a commit as a stage, running the commit if no run is stored.
  csh a3 build <slug> [--check]   Build a3.json, a3.md and a3.html from the stage records and judgments; with
                                  --check, fail when the committed ones differ.
  csh a3 verify <slug>            Re-run every stage at its commit and report any that differs.`,
  },
  {
    names: ["history"],
    options: ["from", "to", "match", "mode", ...RUN_OPTIONS],
    flags: ["no-cache"],
    positional: [1, 1],
    help: `  csh history <slug> [--from <tag>] [--to <tag>] [--match <glob>]
                                  Run a subject at each release tag in the range (tags matching v* by default),
                                  oldest first, and record each run as a stage of the A3 <slug>, opening it if needed.`,
  },
  {
    names: ["results"],
    options: ["base"],
    positional: [3, 3],
    help: `  csh results import <practice> <runner-report> [--base <dir>]
                                  Reduce a Jest or Vitest JSON report to csh-results/v1 (each test file's counts, the
                                  identifiers each citing test cites, the commit) and write it to the practice's
                                  executions path. Test names are dropped, so the file can be committed.`,
  },
  {
    names: ["expect"],
    options: ["expected", "run", "report"],
    flags: ["json"],
    positional: [0, 0],
    help: `  csh expect [--expected <file>] [--run <dir|commit>]
                                  Compare the last report with the expected results (csh/expected.json): each
                                  expectation names an outcome, a signal kind and a subject that must be reported.
                                  Exits 1 on any mismatch.`,
  },
  {
    names: ["subject"],
    options: ["at"],
    positional: [1, 1],
    help: `  csh subject fetch [--at <tag|commit>]
                                  Clone the subject the manifest names at its pinned commit, or another commit beside
                                  it, under .csh-cache/subjects/.`,
  },
  {
    names: ["help"],
    positional: [0, 1],
    help: `  csh help [command]              This text, or one command's part of it. csh <command> --help does the same.
  csh --version                   The version of csh.`,
  },
];

const FOOTER = `
Options common to all: --root <dir> (default: the git repository or the current directory); --subject <dir> (a
checkout of the subject to read instead of the fetched one). An option takes its value as --name value or
--name=value; -- ends the options.

Exit codes: 0 the command did its work, whatever it found; 1 it could not, or an enforcing gate blocked, or results
did not meet what was expected; 2 a usage error, named on standard error with the command's usage; 3 a decision
refused by csh gate --verify, or a past commit that needs other dependencies (csh run). Set CSH_DEBUG=1 to print the
stack of an unexpected error.
`;

export const USAGE = `csh: the Composable Specification Harness

${COMMANDS.map((c) => c.help).join("\n")}
${FOOTER}`;

export const commandNamed = (name: string): Command | undefined => COMMANDS.find((c) => c.names.includes(name));

export const COMMAND_NAMES: readonly string[] = COMMANDS.flatMap((c) => c.names);

/** The synopsis lines of a command: each "csh ..." of its help, without the description beside it. */
export function synopsis(c: Command): string[] {
  return c.help.split("\n").flatMap((l) => {
    const m = /^ {2}(csh \S.*?)(?: {2,}|$)/.exec(l);
    return m === null ? [] : [m[1]!];
  });
}

/** One command's help, with the options and exit codes every command shares. */
export const helpOf = (c: Command): string => `${c.help}\n${FOOTER}`;

/** The version of this package, as its package.json gives it. */
export function version(): string {
  return (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
}
