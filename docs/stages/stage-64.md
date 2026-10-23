# Stage 64: The command line, hardened

**Exit:** every `csh` and `csl` command checks its arguments before it reads or runs anything, and a mistake on the
command line exits 2 with the problem and the command's usage on standard error. No file a person names, and no
report or model csh reads, ends in a stack trace. The README says how to use the command line, and
[the command line guide](../guides/cli.md) quotes `csh help` in full, held to it by a test. Every test that passed
before passes unchanged.

**Status:** exit reached. No result of any check changes, so there are no fixtures and `BUILT_THROUGH_STAGE` is
unchanged; the behaviour is held by `packages/cli/test/args.test.ts` and `packages/cli/test/hardening.test.ts`.

## Built

- `cli`:
  - `commands`: one table of every command, with the options, flags and arguments it takes and its help. `csh help`,
    `csh help <command>`, `csh <command> --help` (or `-h`), the synopsis printed with each usage error and the check
    of each command's arguments all read it. `csh --version` and `csl --version` print the package's version.
  - `args`: `--` ends the options; a flag given a value, an empty value and an option given twice are errors. Each
    command refuses what it does not take, naming the nearest option or command it does (A-240), and checks
    `--budget` and `--mode` once for every command. `--root` and `--subject` must be directories.
  - `csh`: a decision for `gate --verify`, a report, a model, a `countersign` seq and a waiver's date are checked
    before anything runs, and one that cannot be used is named with its path (A-241). An error no command expected
    is one line, with the stack under `CSH_DEBUG=1` (A-242). `csl` does the same, and no longer exits 0 when given a
    command and no file.
  - `exit` and `bin`: the bin scripts end quietly when their reader closes the pipe (A-243), and both drain standard
    output before they exit, as `csh` already did.
- `run` (`evaluate`): a directory with no manifest and no configuration is said as a result, naming `csh init` and
  `--root`, where it was thrown.
- Docs: the README's command list is replaced by a short guide to the command line with its exit codes, the new
  [command line guide](../guides/cli.md) has the rest, and `csh help` states the exit codes and common options.

## What it revealed

Run as a person would, before the stage:

| Command | Before | After |
| --- | --- | --- |
| `csh coverage --josn` | `--josn needs a value`, exit 2 | `unknown option --josn; did you mean --json?` with the usage, exit 2 |
| `csh run --at HEAD --budjet 500` | the run, with the budget ignored | `unknown option --budjet; did you mean --budget?`, exit 2 |
| `csh check --budget abc` | a run with a budget of `NaN` | `--budget is a whole number of milliseconds above 0`, exit 2 |
| `csh gate --verify nope.json` | an `ENOENT` stack trace, exit 1 | `nope.json is not a decision csh gate wrote (no such file)`, exit 2 |
| `csh check` where there is no manifest | a stack trace from `emitProject`, exit 1 | `nothing to evaluate in <dir>: … csh init writes a manifest`, exit 1 |
| `csh status --root /nowhere` | `no csh/component.json under /nowhere`, exit 1 | `--root /nowhere is not a directory`, exit 2 |
| `csh -h`, `csh --version` | `unknown command -h` and the whole usage; `--version needs a value` | the usage, exit 0; `csh 0.1.0` |
| `csh chek` | the whole usage on standard error | `unknown command "chek"; did you mean check?` |
| `csh explain` (no id) | `no finding or overview entry  in the report` | `expects 1 argument, and has 0` with the usage |
| `csh countersign first …` | a full check, then `no valid ledger entry with seq first` | refused before any check |
| `csl emit` (no file) | the usage on standard output, exit 0 | `expects 1 argument`, exit 2 |
| `csl print missing.json` | an `ENOENT` stack trace | `no file missing.json`, exit 2 |

`csh help` also listed `csh subject fetch` twice, and the README's command list had fallen behind it (`--expected`
for `csh analyse`, `--stage` for `csh a3 open`, `--match` for `csh history`). Both now come from one table, and a test
fails when the guide and `csh help` differ or the README leaves out a command.
