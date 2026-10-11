# @csh/adapter-items

## Purpose

`@csh/adapter-items` reads a codebase's documents, feature files, test files and issue exports as an inventory: each requirement, rule, scenario, test file, document and issue is one item, and each reference between them, or from an item to a file, is one edge. It reads structure and never meaning, and it lifts no claim ([11](../../docs/spec/11-ingesting-a-codebase.md), stage 22). [The manifest guide](../../docs/guides/manifest.md#inventory-sources-stage-22) shows how a profile names these sources.

## Where it sits

It belongs to the "Adapters" container, shown in the [containers diagram](../../docs/architecture/containers.mmd), as the inventory readers in [components-adapters.mmd](../../docs/architecture/components-adapters.mmd). `@csh/run` runs each of its four adapters in the isolated adapter subprocess, for sources of kind `Documents`, `Features`, `TestFiles` and `Issues`, or for a practice that names one. The check engine resolves the edges they produce (`@csh/check`, `trace`).

## Public interface

- `@csh/adapter-items/markdown`: `adapter` (id `csh.adapter.items.markdown`), `run(input)`, `firstSentence(value)`. One `document` item per file; a heading that opens with an identifier is a `requirement` item, its heading parts and `- **Name:** value` bullets its fields; `verified-by`, `implements` and `mentions-file` edges. Settings: `idPattern`, `headingFields`, `verifiedField`, `headings`.
- `@csh/adapter-items/gherkin`: `adapter` (id `csh.adapter.items.gherkin`), `run(input)`. `feature`, `rule` and `scenario` items; a rule carries its EARS pattern; `exemplifies` edges from each scenario to its rule; `cites` edges from tags matching the `tagCites` setting.
- `@csh/adapter-items/tests`: `adapter` (id `csh.adapter.items.tests`), `run(input)`. One `test-file` item per file with its test count; `cites` edges from identifiers in test titles. Settings: `idPattern`, `citePattern`.
- `@csh/adapter-items/jsonl`: `adapter` (id `csh.adapter.items.jsonl`), `run(input)`. One `issue` item per JSON line, with status, priority and type; `mentions` edges. Setting: `idPattern`.
- `@csh/adapter-items`: the four modules as namespaces, and `common` (`pathToken`, `slug`, `unique`, `backticked`, `DEFAULT_ID_PATTERN`).

## Depends on and used by

- Depends on: `@csh/kernel` (digests, ordering), `@csh/witness` (the adapter contract, items and edges) and `@csh/adapter-ears-markdown` (`classify`, the EARS pattern of a sentence). No external packages.
- Used by: no package imports it at run time. `@csh/run` names its subpaths in `BUILTIN_ADAPTERS` and depends on it so that they resolve. `subjects/esi-ts` reads ESI.ts through it.

## Invariants it protects

- Every item and edge carries a span, `path:line`, and output never depends on the order files were read in.
- An identifier defined twice in one source is the error `duplicate-id`, and the second is not read. A feature file with nothing to read is the warning `no-items`, and a test file with no test the information `no-tests` (P4).
- Only what the source states is read: a requirement whose verification is prose alone gets no `verified-by` edge, and nothing guesses one ([A-97](../../ASSUMPTIONS.md)).
- Text inside a Markdown code fence or a Gherkin doc string is never structure; a fence closes only on one of the same character at least as long as the one that opened it.

## Rationale

The existing adapters lift claims, and a mature codebase states most of what it means in prose, feature files and tests that no step table or binding covers yet. An inventory makes that material visible to the gap view first: what exists, what refers to what, and what refers to nothing. Adapters stay outside the core ([ADR-12](../../docs/adr/ADR-12-adapters-outside-core.md)) and run isolated with bytes as input ([ADR-20](../../docs/adr/ADR-20-adapter-isolation.md)), so an inventory adapter sees no file it was not given; edges to files are resolved by the check engine, against the files the repository tracks.

## How it is tested

- `test/adapters.test.ts`: requirement headings, fields and the first sentence of Verified by, including one that runs on to indented lines; paths in headings; long fences; identifier patterns with groups or alternatives; Implements lines and headings as references; duplicate identifiers; what a path is; features, rules, scenarios, outlines, doc strings, tags and repeated titles; test counts and citations from titles only, parameterised tests, and calls inside strings, comments and regular expressions; issues, mentions and malformed lines.
- `packages/run/test/items.test.ts`: the four adapters through the isolated runner, with globs and settings from a manifest, and the gaps the trace gives.
- `subjects/esi-ts`: ESI.ts at `2a2da8a`, whose counts its README records.

## Known limits

- Markdown links are not read as references; only backticked paths are ([A-96](../../ASSUMPTIONS.md)).
- A backticked path that names a file deleted on purpose is reported dangling like any other: telling the two apart needs history (stage 25).
- Gherkin identifiers follow titles, so a renamed rule is a new item ([A-99](../../ASSUMPTIONS.md)).
- Tests are found by `describe`, `it` and `test` calls in code with a literal title, including `.each(rows)(title)`, `.each<T>(rows)(title)` and ``.each`table`(title)``; titles built at run time are not read. A small lexer tells code from comments, strings and regular expressions; a slash after `return` is read as division, so a regular expression written straight after `return` can hide the call that follows it on that line.
