# Stage 67: Names in a package's documents

**Exit:** F192, written from [20](../spec/20-symbols-and-task-runners.md) before the code, passes. A cold read of
lgriffin/TypeScript at `a91e938` reads its code, and lists `createRulesMap` at `tsc/internal/format/README.md:20` as
undecided. Every subject in CI still meets its expected results and its `analysis-expected.json`. The cold reads of
Toads at `6f7256e` and tutors-mono-repo at `1279669` are unchanged.

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 68, with stage 68.

## Built

- `adapter-items`: `markdown`: a code-shaped name in backticks in a document below the root that is not a change log is
  a `mentions-symbol` edge to its directory's code (A-223).
- `facts-ts`, `facts-code`: methods are declared as `Owner.name` in TypeScript, Java, Python and Rust (A-224).
- `check`:
  - `trace`: such a name resolves against the package's modules, is unchecked when the directory is no package or the
    name is someone else's, and is otherwise undecided.
  - `overview`: `symbol-undecided` is indeterminate, with what would decide it. `adapter-failed` is now an
    indeterminate entry too (A-227).
- `facts-code`: `run` adds facts one at a time, and `facts-ts` writes a file it cannot parse as a skipped fact (A-227).
- [Q-63](../../QUESTIONS.md) records why an undeclared name is indeterminate rather than a gap.

## What the run revealed

| | Before | After |
|---|---|---|
| TypeScript's code facts | none: the Code adapter overflowed the stack, and the read said nothing | read; two compiler stress tests are skipped as unparsed |
| `tsc/internal/format/README.md` | `createRulesMap` not read | undecided, with `ReadDirectoryChangesW` in `fswatch/README.md` beside it |

CSH had never read TypeScript's code: at stage 63 as now, the facts of its 27,170 source files were added with one
spread, which overflows the stack, and two compiler tests that break the TypeScript parser would each have ended the
read too. The analysis reported 31,872 files read and no failure. That is fixed, and a failed adapter is now an
indeterminate entry.

The first calibration read found names that were not this kind of drift, and the rule was narrowed from each one:

- taskboard's `AGENTS.md` names `moveTask`, a method of `TaskService`. Only Go's reader declared methods, so every
  other language's methods are now declared (A-224).
- tutors-mono-repo's `guides/` holds Markdown and one chart script under `guides/evolution/tools/`, so its guides were
  read as the documents of a package. A package is now a directory that directly holds a module or a manifest.
- A name the line reads beside its file (stage 24) was read a second time as a package's name. It no longer is.

After these, no subject in CI, and neither Toads nor tutors-mono-repo, has a `symbol-undecided` entry.
