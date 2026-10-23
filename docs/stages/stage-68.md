# Stage 68: Task runners

**Exit:** F193 and F194, written from [20](../spec/20-symbols-and-task-runners.md) before the code, pass. Every subject
in CI still meets its expected results and its `analysis-expected.json`. The cold reads of Toads, tutors-mono-repo and
lgriffin/TypeScript change only as stage 67 says.

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 68.

## Built

- `witness`, `facts`: a `task` fact (runner, file, name), a name `*` for an open set.
- `facts-code`: `tasks` reads hereby's, make's and just's files at the root as text (A-225).
- `run`: `propose` adds those files to the Code source.
- `adapter-items`: `markdown` reads `hereby x`, `npx hereby x`, `make x` and `just x` as tasks, and `pnpm run x` and
  `yarn run x` as scripts (A-226). A sentence that says the command is gone, or not built yet, leaves it unchecked.
- `check`: `trace` resolves a task against its runner's facts, and a Verified by field naming one supports a status.

## What the run revealed

Toads' README says "Next, per the phased plan: ... seed data for `just seed`", and its justfile has no `seed` recipe:
the first read reported it as a dangling reference. The recipe is planned, not broken, so a sentence about what is not
built yet now leaves a command unchecked. TypeScript's `Herebyfile.mjs` makes many of its tasks through a helper whose
`name` is a parameter, so its set is open and its guides' `npx hereby` commands are unchecked. A `name` written as a
literal still resolves.
