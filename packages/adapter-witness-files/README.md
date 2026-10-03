# @csh/adapter-witness-files

## Purpose

This is reference adapter A: it reads NDJSON witness files and returns every record as a witness, and each passing record also as an example claim lifted through the bindings read in reverse (key to term). Records it cannot lift are kept as unliftable with their source span instead of being dropped. A version 2 record with no outcome is joined by test identity to the execution line the test runner's reporter wrote, and a witness's citations are carried onto its example ([09](../../docs/spec/09-anchor-harness-a3.md), sections 3.2 and 6.2).

## Where it sits

It belongs to the "Adapters" container, with `@csh/witness` and `@csh/adapter-ears-markdown`, shown in the [containers diagram](../../docs/architecture/containers.mmd). It is the witness reader and example lifter in [components-adapters.mmd](../../docs/architecture/components-adapters.mmd). The command line runs it in an isolated subprocess for sources of kind `Witnesses`.

## Public interface

- `adapter`: the `Adapter` object (manifest and `run`) that the command line loads.
- `manifest`: id `csh.adapter.witness-files`, version, `csh-ir/v1`, produces `claims` and `witnesses`, input kind `Witnesses`.
- `run(input)`: reads the files in path order and returns claims, witnesses (with the joined outcome), diagnostics, witness spans and the execution lines it read. `input.config.cites` names the source a witness's citations refer to.
- `liftValue(v, t)`: types one witness value against a model type (integer strings or safe integers, booleans, enumeration member names).
- `exampleName(id)`: a legal example name derived from a witness id, such as `WitnessW1` from `w1`.

## Depends on and used by

- Depends on: `@csh/kernel` (model types) and `@csh/witness` (witness parsing and the adapter contract). No external packages.
- Used by: no package imports it directly. `@csh/run` names it in `BUILTIN_ADAPTERS` and loads it by module specifier inside the adapter subprocess.

## Invariants it protects

- Every record is returned as a witness, including failed ones; a failing record lifts no claim (P2, CSH-004).
- A record whose outcome is neither stated nor joined is unknown and lifts no claim; a test identity that finished twice with different outcomes is unknown too ([A-39](../../ASSUMPTIONS.md)).
- A citation without a source to refer to is reported (`citation-without-source`), never attached to a guessed source.
- A record with a key that no binding names, a value that is not a strict integer, or a malformed line becomes an `unliftable` entry with reason and span, plus a diagnostic (P4, CSH-001, CSH-002).
- Lifting never approves: an example lifted through a candidate binding is noted with `depends-on-candidate-binding` and stays candidate (P1, CSH-003).
- Output does not depend on the order files are given in (P8).
- It sees only file bytes, the vocabulary and bindings with their authority, never the ledger or the file system (P6).

## Rationale

Adapters sit outside the core, and version 1 ships two ([ADR-12](../../docs/adr/ADR-12-adapters-outside-core.md)). A passing test is both a claim, so it can conflict jointly, and a witness, so it can be judged ([ADR-13](../../docs/adr/ADR-13-passing-test-is-claim-and-witness.md)). Adapters run isolated and receive bytes, not paths ([ADR-20](../../docs/adr/ADR-20-adapter-isolation.md)).

## How it is tested

- `test/adapter.test.ts`: lifts a passing record through reversed bindings; keeps a failing record as a witness without a claim; reports unknown keys, non-integers and malformed lines as unliftable; notes a candidate binding; flags duplicate example names; joins a record with no outcome to its execution line; never treats a record with no outcome as passed; makes an ambiguous identity unknown; keeps a stated outcome and reports a malformed execution line; carries citations onto the example; is deterministic regardless of file order; types values strictly.
- `packages/run/test/faults.test.ts`: missing and malformed witness files end to end.
- Fixtures: F24 (an unbound key, `unknown-term`), F30 to F35 (the base witness against approved and candidate bindings, a missing key, a mocked account), F40, F41, F44, F45 and F64 (witnesses reused across snapshots).

## Known limits

- Only keys that a binding names can be lifted; there is no fuzzy matching, by design.
- Two witnesses whose ids map to the same example name keep only the first as a claim; the second is unliftable with `duplicate-name`.
- A record with no result and no post-state keys asserts nothing and is unliftable with `nothing-asserted`.
