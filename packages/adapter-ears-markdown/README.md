# @csh/adapter-ears-markdown

## Purpose

This is reference adapter B: it finds identified requirement sentences in Markdown (table rows, list items and bare lines), classifies each by EARS pattern and returns it as a citable item with its span and text digest. It never generates predicates; a person writes the requirement in CSL and cites the item.

## Where it sits

It belongs to the "Adapters" container, with `@csh/witness` and `@csh/adapter-witness-files`, shown in the [containers diagram](../../docs/architecture/containers.mmd). It is the sentence extractor in [components-adapters.mmd](../../docs/architecture/components-adapters.mmd). The command line runs it in an isolated subprocess for sources of kind `Requirements`.

## Public interface

- `adapter`: the `Adapter` object (manifest and `run`) that the command line loads.
- `manifest`: id `csh.adapter.ears-markdown`, version, `csh-ir/v1`, produces `items`, input kind `Requirements`.
- `run(input)`: reads the files in path order and returns items, diagnostics and, for optional-feature sentences, unliftable claims.
- `classify(text)`, `EarsPattern`: the EARS pattern of a sentence by its keywords (ubiquitous, event-driven, state-driven, unwanted-behaviour, complex, optional-feature).
- `clausesOf(pattern)`: which clauses (while, if) a pattern carries, for the shape check.
- `DEFAULT_ID_PATTERN`: `[A-Z][A-Z0-9]*-[0-9]+`; `requirementIdPattern` in the adapter configuration overrides it.

## Depends on and used by

- Depends on: `@csh/kernel` (`digestOf`, `ClaimSet`) and `@csh/witness` (adapter contract types). No external packages.
- Used by: no package imports it directly. `@csh/cli` names it in `BUILTIN_ADAPTERS` and loads it inside the adapter subprocess. `@csh/check` has its own copy of the clause table for the shape check.

## Invariants it protects

- Each item keeps its source span and the digest of its exact text, so an approval can record what it cited and a reworded sentence returns the citing fragment to candidate (P4, P5, CSH-001, CSH-017).
- No predicate is ever derived from prose; items are cited, not translated (P1, P8).
- A sentence that matches no pattern is kept with pattern `none` and a `no-pattern` warning, not dropped (P4, CSH-002).
- An optional-feature (`WHERE`) sentence is recorded as unliftable with reason `feature-scope` (P4, CSH-002).
- A duplicate identifier is an error diagnostic; the first definition wins (P3).
- Output does not depend on file order (P8).

## Rationale

Requirement sentences are cited, not translated ([ADR-14](../../docs/adr/ADR-14-cite-not-translate.md)). Adapters sit outside the core ([ADR-12](../../docs/adr/ADR-12-adapters-outside-core.md)) and run isolated with bytes as input ([ADR-20](../../docs/adr/ADR-20-adapter-isolation.md)).

## How it is tested

- `test/adapter.test.ts`: identifies table rows, list items and bare lines; reports duplicate identifiers; marks optional-feature sentences unliftable with `feature-scope`; honours a configured identifier pattern and is deterministic.
- Fixtures: F50 (an uncited sentence appears as an uncited item in the gap view), F51 (a reworded sentence returns the approved citing fragment to candidate with `source-text-changed`), F52 (a citation of a missing identifier gives `dangling-citation`).

## Known limits

- Pattern recognition is by keywords at the start of the sentence (`THE`, `WHEN`, `WHILE`, `IF ... THEN`, `WHERE`) and the presence of `SHALL`; it does not parse EARS grammar fully.
- Only Markdown table rows, list items and lines that start with an identifier are recognised; a sentence split over several lines is read up to the line end.
- Optional-feature requirements have no CSL form in version 1.
