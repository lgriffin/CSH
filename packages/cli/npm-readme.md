# CSH

CSH is a static analysis tool for the gap between what a repository says and what it does. It reads the prose,
specifications, diagrams, tests and code of any git repository and reports every result as one of three outcomes:

- **converged**: two sources agree, with the evidence for it;
- **gap**: they disagree, or one says what nothing checks. Each gap names where it is and what would close it;
- **indeterminate**: CSH could not decide, and says what would decide it.

It never writes into the repository it reads and never runs its code or tests.

## Install

Needs Node 22.18 or later and `git` on PATH.

```sh
npm install --global @lgriffin/csh     # puts csh, csl and csh-agent on PATH
npx @lgriffin/csh analyse .            # or run it once without installing
```

A global `csh` can shadow the C shell (`/bin/csh` on macOS). The same command is also installed as `cshx`.

## Analyse a repository

```sh
csh analyse path/to/repo
```

It writes four files under `reports/` of the current directory:

| File | What it is |
| --- | --- |
| `csh-analysis.html` | Every result, danger first, then conflicts, gaps, indeterminate and converged |
| `csh-analysis.json` | The same, as `csh-analysis/v1`, for scripts |
| `csh-a3.html` | The A3: the analysis read as one problem, with the few changes that close the most |
| `csh-a3.md` | The A3 as Markdown, to paste into an issue or a pull request |

Useful options: `--at <commit>` reads another commit, `--out <dir>` writes elsewhere, `--json` prints the analysis
as JSON, and `--expected <file>` exits 1 when the results differ from what you expected (for CI).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | The command did its work, whatever it found |
| 1 | It could not, or the results did not meet `--expected` |
| 2 | A usage error |
| 3 | A refused decision |

## More

`csh help` lists every command. Going further, CSH can hold a profile of a component (`csh init`), check it on every
change (`csh run`, `csh diff`) and gate approved rules in CI. The guides are at
<https://github.com/lgriffin/CSH/tree/main/docs/guides>.

Licence: MIT.
