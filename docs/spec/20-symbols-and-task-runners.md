# 20. Symbols in prose, and task runners

The cold read of lgriffin/TypeScript ([19](19-from-the-typescript-run.md)) left two things that CSH did not reach, listed
on [issue 89](https://github.com/lgriffin/CSH/issues/89). The formatter's README names `createRulesMap`, a function the
Go port does not have. And the repository's guides tell the reader to run `npx hereby test` and a dozen other tasks of
its task runner, which CSH did not read, while it reads `npm run x` against package.json (stage 24). This document
states the behaviour that stages 67 and 68's golden fixtures are written from. A third gap on the issue, reading test
suites as evidence, is a separate line of work.

Nothing here changes the three outcomes. A name CSH cannot place is indeterminate, never a gap, and a command whose
runner CSH cannot read is unchecked.

## 1. A name a package's own document gives in backticks (stage 67)

**The problem.** `tsc/internal/format/README.md` says the rules are requested "via `createRulesMap`". The Go code of
`tsc/internal/format` calls the function `buildRulesMap`. CSH reads a symbol only in the two shapes of stage 24, a
symbol beside a code path ("`buildError` in `src/core/util/error.ts`") and a path that declares a symbol, so this name was
never read.

Most names in backticks are not names of this repository's code. A measure over the Markdown of TypeScript, Toads,
tutors-mono-repo and CSH itself found 240 names in backticks shaped like code names. Of the names that no code of the
repository declares, almost all are names of other code: a Windows API (`ReadDirectoryChangesW`), a JSON key
(`applicationKey`), a framework's type (`SecretStr`), another repository's class, or a Svelte component, whose name is
its file's. So a name that is not declared cannot be refuted: it is indeterminate, and the read says what would decide
it.

**What changes** (A-223). In a Markdown document that is not at the repository's root, and is not a change log
(`CHANGELOG`, `CHANGES`, `HISTORY`, `NEWS` or `RELEASES`, any case and extension), a token in backticks, outside fences,
that is a whole name shaped as code names are, is a mention of a symbol of the document's own package:

- the name is `camelCase` or `PascalCase` with at least two words: a lower-case letter is followed by a capital
  somewhere in it (`createRulesMap`, `FormatSpan`, but not `Format`, `format` or `HTTP`). `()` after it is allowed;
- the document's package is its directory and the directories under it.

A name that the line already reads beside its file (stage 24) is read only that way.

It is read as a `mentions-symbol` edge from the document to `symbol:<directory>/#<name>`, and checked against the code
facts:

- when the directory is no package, the mention is unchecked. A package is a directory that directly holds a module the
  code facts read, or a manifest (`package.json`, `Cargo.toml`, `pyproject.toml`, `setup.py`, `go.mod`, `pom.xml`,
  `build.gradle` or `build.gradle.kts`). A `guides/` directory with a script in `guides/tools/` is not a package, while
  a crate's README beside its `Cargo.toml`, with its code in `src/`, is one;
- when a module under the directory could not be parsed (section 3), it may declare the name, so the mention is
  unchecked;
- when a module under the directory declares or exports the name, the mention resolves. For a member, such as a Go
  method `formatSpanWorker.processNode`, the part after the last `.` is the name;
- when a module elsewhere in the repository declares it, or a tracked file's name before its extension is the name (a
  component), or its sentence says it is gone (A-210) or not built yet (section 2), the mention is unchecked;
- otherwise the name is **undecided**: the overview has one indeterminate `symbol-undecided` entry per document, listing
  each name with its line, and what would decide it: "Check each name by hand: rename it in the prose if the code
  renamed it, or leave it if it names code outside the repository".

A mention of a package is never dated for stale prose: it names no one file.

**Methods are declared** (A-224). Prose names methods as often as functions (`processPair`, `moveTask`). Go's reader
already declares a method as `Type.name`. The readers of TypeScript, Java, Python and Rust now do the same:

- TypeScript: the methods, accessors and function-valued properties of a class, and the method signatures and
  function-typed properties of an interface. A computed or private (`#x`) name is none;
- Java: each method of a type's body, once however it is overloaded. A method is never exported, and no import resolves
  to one;
- Python: each function defined directly in a class body;
- Rust: each function of an `impl` or a `trait` at the top of a file.

A method's name is its part after the last `.`. Nothing else reads a declaration with a `.` in it as a top-level name,
so no other check changes.

## 2. A command of a task runner (stage 68)

**The problem.** TypeScript's guides say `npx hereby test`, `npx hereby lint`, `npx hereby baseline-accept` and so on,
and the tasks are defined in `Herebyfile.mjs`. CSH reads `npm run x` against package.json's scripts (stage 24), and no
other runner, so a guide that names a task the runner no longer has is never found. `make` and `just` are the same.

**What changes** (A-225, A-226). The code facts read the task runner files at the repository's root (A-225), as text,
never run:

- `Herebyfile.js`, `.mjs`, `.cjs`, `.ts` or `.mts` (hereby): each `name` property of a `task(...)` call whose whole
  value is a string literal is a task, its escapes decoded. Comments are not read, nor a `name` outside a `task(...)`
  call. When any `name` property of a call is not a literal (a shorthand `name,`, a variable, a template with `${`, or a
  literal joined to more, as `"build" + suffix`), or the file has no `task(...)` call, tasks may be named that the text
  does not show, so the set is open.
- `Makefile`, `makefile` or `GNUmakefile` (make): each target of a rule line, a line starting with no tab whose first
  `:` is not part of `:=` or `::=`. A target starting with `.` is special and is no task. A target holding `%` or `$`,
  or an `include`, `-include` or `sinclude` line, makes the set open.
- `justfile`, `Justfile` or `.justfile` (just): each recipe, a line starting at the first column with a name, its
  parameters, and a `:` that is not `:=`, after any attributes such as `[private]`; and each `alias x := y`. An import
  (`import 'x.just'` or `import? ...`), a module (`mod x` or `mod? x`) or an `!include` line makes the set open; a
  recipe named `import-data` or `mod` is a recipe.

Each task is a `task` fact naming its runner, its file and its name; an open set adds a task named `*`.

In a Markdown document, outside fences, a command in backticks names a task (A-226):

- `hereby x` or `npx hereby x`: the hereby task `x`;
- `make x`: the make target `x`;
- `just x`: the just recipe `x`;
- `pnpm run x` and `yarn run x`: package.json's script `x`, as `npm run x` already is.

The task is the first word after the runner. When that word starts with `-` (`npx hereby --tasks`, `make -C dir x`),
the command names no task. The name ends at the end of the token or at a space.

The mention resolves when the runner's file declares the task. It is unchecked when no file of that runner was read,
when the set is open, or when every sentence naming the command says it is gone (A-210) or not built yet. A sentence
says something is not built yet when it says planned, a phased plan, plans to, roadmap, upcoming, not yet, yet to,
to come, in the future, or TODO: Toads' README says "Next, per the phased plan: ... seed data for `just seed`", and its
justfile has no `seed` recipe yet. "Next" alone is not enough, since "Next, run `make x`" is an instruction. Otherwise it is a dangling reference, as
`npm run x` naming no script is. A Verified by field that
names a command the runner declares supports the requirement's status, as `npm run x` does.

## 3. A code read that fails is said, and a large one does not fail (D4)

**The problem.** The calibration run of stage 67 found that CSH had read none of TypeScript's code, at stage 63 as now.
The Code adapter added each reader's facts to its list with a spread, `facts.push(...more)`, and a spread of the
hundreds of thousands of facts TypeScript's 27,170 source files give overflows the stack. Two of TypeScript's compiler
tests also break the TypeScript parser on their own: `binderBinaryExpressionStress.ts`, an expression thousands of
operators deep that overflows the stack, and `decoratorOnAwait.ts`, which fails an assertion of the parser. Either
error ended the adapter, so the read had no code facts at all. The analysis still said it had read 31,872 files, and
said nothing of the failure.

**What changes** (A-227). The Code adapter adds facts one at a time. A file the TypeScript reader cannot parse is a
`skipped` fact with the reason `unparsed: ` and the error, as a Go file already is, and the other files are read. An
adapter that fails all the same is an indeterminate `adapter-failed` entry naming its source and the error, never
silence: nothing of that source was read, so nothing that rests on it was decided.

## 4. Limits kept

- **Commands in fences.** A command in a fenced block, such as a shell session, is not read, as `npm run x` in a fence
  is not.
- **A runner file below the root.** `make -C sub x` and a `Makefile` in a subdirectory are not read: which file a
  command runs depends on where it is run.
- **One-word names.** `Format`, `scanner` and `rules` may be names of code, and are not read: a plain word is prose too
  often.
- **A name the package's code does not declare** is never a gap (section 1).
- **Fields and properties** are not declared, so a name of one is undecided.
- **The Java and Rust readers** may still stop on a file their parser cannot read; only TypeScript's is changed (section 3).

## 5. Stages 67 and 68

**Exit of stage 67:** F192 passes, written from this document before the code. A cold read of lgriffin/TypeScript at
`a91e938` reads its code, and lists `createRulesMap` at `tsc/internal/format/README.md:20` as undecided. Every subject in CI still meets
its expected results and its `analysis-expected.json`, and the cold reads of Toads and tutors-mono-repo change only by
`symbol-undecided` entries, each checked by hand.

**Exit of stage 68:** F193 and F194 pass, written from this document before the code. The same reads change only by
task mentions, each checked by hand.

- F192: names in a package's documents (section 1).
- F193: commands of hereby, make and just, each with a missing task (section 2).
- F194: open task sets, a command naming no task, and a command in a fence (sections 2 and 4).
