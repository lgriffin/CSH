# F193

A command of a task runner names a task ([20](../../docs/spec/20-symbols-and-task-runners.md), section 2; stage 68).

`docs/dev.md` names, in backticks:

- `npx hereby test` and `hereby build`, tasks `Herebyfile.mjs` names, and `hereby release`, which it does not.
- `make lint`, a target of `Makefile`, and `make docs`, which is none. `.PHONY` is a special target, and
  `VERSION := 1.0` is an assignment, not a rule.
- `just fmt`, a recipe of `justfile`; `just d`, an alias; `just deploy production`, a recipe with a parameter; and
  `just publish`, which is none.
- `pnpm run check`, a script of `package.json`, and `yarn run verify`, which is none.

- `make seed`, which is none, in a sentence that says it is not yet written: unchecked.

The four others that name nothing are one dangling reference.

The expected result was written from the specification before the code.
