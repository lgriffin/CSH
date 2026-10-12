# F131

A small TypeScript hub whose rules the runs could not state. A session pod imports core, and core imports the
database client: no single import breaks "pods hold no database access", but the chain does, and `reaches` names it
step by step. The frontend imports types from core in two files and a value in one: `values: true` counts only the
value import. Core and util import each other, a cycle between the directories under `src`; the database has none. A
rule against `src/pakages/**`, a typo, holds and says its target selects nothing. Three use case files make "ten use
cases" false and "three" true, the two claims contradict each other, and "not four" holds. `packageManager`, `workspaces` and
`devDependencies` of package.json are fields, so the pnpm 9 claim is refuted and the workspace and Vitest claims hold.
From real runs ([13](../../docs/spec/13-from-real-runs.md)), section 2; stage 39.

The expected result was written from the documents before the fixture was first run.
