# Stage 23: Code facts

**Exit:** ESI.ts layering is stated as CSL rules that cite ARCH IDs, and they are evaluated against its import graph.
Facts are identical at two commits with different lockfiles, and nothing is installed
([11](../spec/11-ingesting-a-codebase.md)).

**Status:** exit reached. `csh run --root subjects/esi-ts` reads the code of ESI.ts at `2a2da8a` and evaluates three
rules, citing ARCH-03 and ARCH-10. All three are `satisfied`, with `FactsCurrent` met. At `54f7b20` and `0c72b15`,
commits that change only `package-lock.json`, the facts are the same as at their parents, line for line apart from the
commit (4,455 and 4,411 facts).

## Built

- `facts-ts`, a new adapter for sources of kind `Code`. It uses the TypeScript parser alone, file by file ([A-100](../../ASSUMPTIONS.md)). It reads modules, dependencies (imports, re-exports, import types, import-equals, and literal dynamic imports and requires), exported names, and the `package.json` fields that say what a package is. A relative import that resolves to nothing, or a computed one, is a `skipped` fact.
- `witness` and `facts`: `csh-facts/v2` adds the facts `module`, `export` and `field`. Version 1 lines are read unchanged.
- `kernel`, `csl` and `arch`: the selector `modules(globs, { except })`, and `globRegExp` and `matchesGlobs` in the kernel ([A-101](../../ASSUMPTIONS.md)).
- `run` and `check`: every adapter is handed the commit it reads at. Facts at a subject's pinned commit are current.
- `component`: a version 2 manifest may declare sources beside a specification ([A-102](../../ASSUMPTIONS.md)).
- The adapter sandbox: reading an environment variable gives undefined, and `new Date(value)` is allowed ([A-103](../../ASSUMPTIONS.md)).
- `subjects/esi-ts`: a specification with three rules and a `Code` source. The charter source moved from the manifest into the specification.

## What ESI.ts revealed

- **ARCH-03 holds, but the charter says it is unchecked.** ARCH-03 names code review as its only verification. The rule that the request pipeline receives the cache, rate limiter and circuit breaker as parameters is now checked, and it holds: no module of the pipeline but `dependencies.ts` imports them. The charter and the code agree on the layering; they disagree on whether it is checked. A person decides by approving the rule. Reporting the disagreement itself needs claims (stage 24).
- **The SDE is a clean side module.** `src/sde/**` imports only `src/core/ports/**`, built-ins and four packages, and nothing else in `src` imports it, as ARCH-10 says.
- **The facts carry what stage 24 needs.** `buildError` is exported by no module. `isCircuitOpen` is exported from three. `package.json` names seven entry points, and its Node floor is `>=22.12.0`. These are inputs to rows 2, 3, 4 and 6, not results yet.

## What proved wrong or costly in the documents

- The plan expected a facts scanner run as a harness, like `facts-imports`. A subject has no harness (`harness-on-subject`, stage 21), so the scanner became an adapter, run isolated on the bytes of the files. The sandbox then had to let the TypeScript parser load (A-103).
- A rule needs a specification, and a specification declares its sources without globs. Declaring the `Code` source beside the specification (A-102) kept the CSL and the IR unchanged.
- A system name must be an identifier, so the profile's system is `EsiTs`, not `ESI.ts`.

## Effort

About 310 lines of source and 250 lines of tests. Effort was not timed.
