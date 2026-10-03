# @csh/witness

## Purpose

`@csh/witness` defines the witness record (csh-witness/v2, and version 1, which it still reads), the execution line (csh-execution/v1), the adapter contract (manifest, input, output, diagnostics) and the parsing and validation of NDJSON witness files. It also provides `recordWitness`, a helper any JavaScript or TypeScript test can call to record what happened during an execution, without asserting anything.

## Where it sits

It belongs to the "Adapters" container, with `@csh/adapter-witness-files` and `@csh/adapter-ears-markdown`, shown in the [containers diagram](../../docs/architecture/containers.mmd) and in [components-adapters.mmd](../../docs/architecture/components-adapters.mmd) (the witness reader). It is the shared vocabulary between adapters and the check engine.

## Public interface

- `Witness`, `Json`, `LocalResult`: one recorded execution (event, pre, args, result, post, execution facts, subject commit, and in version 2 the requirement identifiers it cites). In version 2 the local result is optional.
- `Execution`, `parseExecutions(text)`: one finished test as the test runner's reporter records it (test identity and outcome), and the parser for an execution file.
- `outcomeOf(w)`: a witness's outcome, `unknown` when the record states none.
- `SourceItem`: an identified item from a source, such as a requirement sentence with its span and text digest.
- `Adapter`, `AdapterManifest`, `AdapterInput`, `AdapterOutput`, `Diagnostic`: the adapter contract. An adapter receives file bytes, the vocabulary and bindings (and, for a witness source, the execution file's bytes), and returns claims, witnesses, items, diagnostics and the execution lines it read. `run` may return a promise.
- `witnessDigest(w)`: the digest of a witness without `recordedAt`.
- `parseWitnesses(text)`, `WitnessProblem`: parses an NDJSON file into records and a list of problems (malformed lines, duplicate ids).
- `validateWitness(v)`: structural validation of one record, returning a reason or `undefined`.
- `buildWitness(input, ctx)`, `recordWitness(input, ctx)`, `RecordInput`, `RecordContext`: build a version 2 record, or append it to the witness file (default `reports/witness.ndjson` or `CSH_WITNESS_FILE`). The local result is set only when the caller gives one.

## Depends on and used by

- Depends on: `@csh/kernel` (canonical JSON, digests, model types). No external packages.
- Used by: `@csh/adapter-witness-files`, `@csh/adapter-ears-markdown`, `@csh/check` (pool and evidence) and `@csh/run` (running sources). `@csh/harness` builds its records with `buildWitness`; hand-written records use `recordWitness`.

## Invariants it protects

- Malformed lines and duplicate ids are reported as problems, never dropped silently (P4, CSH-002).
- `recordedAt` never enters a witness digest, so the same execution facts give the same digest (P8).
- A witness records the local result of an execution as a fact; it carries no conformance verdict (P2, CSH-004).
- A record with no outcome is unknown, never passed: nothing in this package supplies an outcome nobody observed (Anchor, harnesses and A3, section 3.2).
- Version 1 records stay readable, and keep the outcome they state (section 6.3).
- A witness names the subject commit it was recorded at, so evidence can be scoped to a snapshot and judged stale later (P5, CSH-007).
- Inputs are data: the adapter contract passes bytes, the vocabulary and bindings, never paths or the ledger (P6).

## Rationale

Adapters sit outside the core and produce IR in one neutral envelope ([ADR-12](../../docs/adr/ADR-12-adapters-outside-core.md)). A passing test lifts as both a claim and a witness, so the witness format must keep the execution facts apart from any claim ([ADR-13](../../docs/adr/ADR-13-passing-test-is-claim-and-witness.md)). Adapters receive bytes rather than paths ([ADR-20](../../docs/adr/ADR-20-adapter-isolation.md)).

## How it is tested

- `test/witness.test.ts`: builds a well-formed record, leaves `recordedAt` out of the digest, reports malformed lines and duplicate ids, appends one line per record to the witness file, writes version 2 with no outcome unless one is given, still reads version 1, validates citations, and parses execution lines.
- `packages/run/test/faults.test.ts`: a malformed or missing witness file leaves obligations unknown.
- Fixtures: F82 to F85 read version 2 records and execution files; F24 and F30 to F35 read `inputs/witnesses.ndjson` through this format; F40, F41, F44, F45 and F64 reuse witnesses across steps.

## Known limits

- `recordWitness` no longer defaults the local result to `passed`. A hand-written record with no outcome stays unknown unless an execution line for its test identity joins it.
- The subject commit defaults to `CSH_COMMIT`, then `GITHUB_SHA`, then `unknown`; a witness recorded as `unknown` is not an ancestor of any snapshot commit, so `csh check` judges it stale.
- Runtime observations (deployment identity, interval, sampling) are not part of version 1 records (CSH-012 is out of scope here).
