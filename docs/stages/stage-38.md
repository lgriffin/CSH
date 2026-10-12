# Stage 38: A proposed profile and coverage in every run

**Exit:** `csh init --subject <dir>` writes a manifest proposed from the checkout, prints every guess and the
coverage of the proposal, and `csh run` says in one line how much of the repository the profile reads
([13](../spec/13-from-real-runs.md), section 1; [issue 66](https://github.com/lgriffin/CSH/issues/66), section 1).

**Status:** exit reached on F130 and on CSH's own checkout.

## Built

- `run`: `proposeProfile` (`propose.ts`) reads a checkout's tracked files and proposes requirements, documents,
  features, tests, code and issues sources with their practices and settings ([A-140](../../ASSUMPTIONS.md)).
  `coverageOfSources` gives the coverage of sources before a manifest exists; `coverageOf` now calls it.
- `cli`: `csh init --subject <dir>` writes the proposal under the same root as `csh init`, prints each guess, the
  coverage of the proposal and the next commands. `csh run` adds the coverage line ([A-141](../../ASSUMPTIONS.md)).
- `testkit`: an `init` expectation. A fixture's `inputs/subject` is committed to a scratch repository with no remote,
  each proposed source is compared by the files it reads (not its globs), and the proposal is then run against the
  checkout as `run` expectations are.

## What the fixture revealed

- Sources are read from the file system, not from git, so a glob such as `docs/**/*.md` also reads untracked files,
  and `**/*.md` would read every package's README in `node_modules`. Every proposed source therefore excludes the
  directories that are never proposed, and each is checked against the tracked files it means to read, with any file
  its globs select wrongly named in `exclude`.
- `CC` is an external family (Creative Commons), which the first version of a unit test used as an example prefix.

## Run on CSH's own checkout

The proposal for this repository found eight identifier families (ADR, CSH, ARCH, LCK, GATE, REQ, ACC, PROC), 35
requirement documents (the ADRs, whose headings begin with their identifier), the lockout features with `LCK` tags as
citations, 72 test files and 180 code files, and read 525 of 1,055 tracked files. Most of the rest are fixture inputs,
which a profile for CSH would read as fixtures rather than as code. The run took 4.5 s.

## Left open

- An ADR is proposed as a requirements document because its heading begins with its identifier. Whether a decision is
  a requirement is a question for stage 42 (a rule that cites an ADR does not verify it).
- `csh run --subject <dir>` refuses a checkout with ignored files (`node_modules`), so the next command printed is
  `csh subject fetch` then `csh run`, which reads a clean clone.
