# Stage 22: Items and edges

**Exit:** the 66 charter requirements, 619 Rules and 792 scenarios of ESI.ts are inventoried with spans, ARCH-03 is
reported `unverified`, and backticked paths that name no tracked file are reported dangling
([11](../spec/11-ingesting-a-codebase.md), amended).

**Status:** exit reached. `csh run --root subjects/esi-ts` reads 1,914 items and about 2,700 edges in under two seconds.

## Built

- `witness`: `SourceItem` gains `kind` and `attrs`. The new record `ItemEdge` has the relations `implements`, `verified-by`, `exemplifies`, `cites`, `mentions` and `mentions-file`, and `AdapterOutput` gains `edges`.
- `adapter-items`, a new package with four adapters, each run isolated:
    - `markdown`: requirement headings, fields and the mechanisms of Verified by, Implements lines, and backticked paths.
    - `gherkin`: features, rules and scenarios, without a step table.
    - `tests`: test files, their counts, and citations from titles.
    - `jsonl`: issues and their mentions.
- `check`: `trace` resolves every edge against every item and against the files git tracks. It gives the gaps `dangling-reference` ([A-96](../../ASSUMPTIONS.md)) and `unverified` ([A-97](../../ASSUMPTIONS.md)). An item with a kind is never `uncited` ([A-99](../../ASSUMPTIONS.md)). The report carries each item's kind and fields, and the edges with what each resolved to.
- `component`: a declared source takes `include` and `exclude` globs, and a practice takes `settings` for its adapter. The practice kinds `documents` and `issues` are new.
- `run`: the built-in kinds `Documents`, `Features`, `TestFiles` and `Issues`, the globs, the settings, and `trackedFiles`.
- `subjects/esi-ts`: five practices (charter, guides, BDD, TDD, beads). Their results are in its README.

## What ESI.ts revealed

- **Prose verification.** Eight charter requirements name no mechanism in the first sentence of Verified by: ARCH-03, DES-05, DOC-06, PROC-01, PROC-02, PROC-04, PROC-05 and REL-04. Each states its status as Practised, Partial or Gap, so the charter is honest about them. CSH can now say so without reading the status.
- **Thin test traceability.** Only 10 of 261 test files cite a charter requirement in a title. The link from tests to requirements runs through the BDD rules, and every one of the 619 rules has a scenario.
- **References to nothing.** 34 backticked paths name no tracked file. Some are build output, such as `docs-site/.vitepress/dist`. Some are files that were renamed or deleted, such as `src/core/logger/logger.ts`. One is a deletion stated on purpose: DOC-01 is verified by a test that keeps `guides/MUTATION-TESTING.md` deleted. Syntax cannot tell these three apart. History can, and that is stage 25's job.
- **First runs were noisy, and the noise taught the rules.** Reading `./errors` from the document's directory reported every package entry point as a missing file (A-96). Any identifier in a test file counted `SHA-256` as a citation (A-98). A guide that repeats charter identifiers as section headings made seven duplicate requirements, which is why `headings: "references"` exists.

## What proved wrong or costly in the documents

- The stage 22 exit expected `buildError` to be reported dangling. It is a symbol, not a file, and only the symbol facts of stage 23 can resolve it. That row moved to stage 24.
- Globs were planned for stage 27. They were needed here, because ESI.ts's `guides/` holds the charter and `tests/` holds fixture repositories with feature files of their own.

## Effort

About 650 lines of source and 300 lines of tests. Effort was not timed.
