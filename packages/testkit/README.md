# @csh/testkit

## Purpose

`@csh/testkit` runs the golden fixtures: for each `fixtures/Fnn` it drives the real pipeline, compares what it observes with `expected.json`, and collects every mismatch instead of stopping at the first. It also checks solver answers independently of the solver's own claims, and builds throwaway git repositories with throwaway signing keys for the ledger fixtures.

## Where it sits

The test kit is development tooling and is not part of any runtime container. It appears in the [containers diagram](../../docs/architecture/containers.mmd) as "Test kit (development only)", with one relation: it runs fixtures end to end through `@csh/run`. No runtime package depends on it.

## Public interface

- `FixtureRunner`, `RunnerOptions`: runs one fixture by id (`run(id)`), including two-step scenarios and ledger scenarios.
- `FixtureResult`: id, stage, section, pass, failures, an optional skip reason, `pending` for a fixture whose stage is not built yet, and time taken.
- `BUILT_THROUGH_STAGE`, `fixtureStage(dir, id)`: the last stage built; a fixture of a later stage is reported as pending, never run and never failed.
- `listFixtures(dir)`: fixture ids (`F` and two digits) in order.
- `summarise(results)`: a text summary of a run.
- `resolveSpecSource(file)`, `relativeTo(root, p)`: path helpers for fixture specifications.
- `verifyCounterexample(finding, model, fragments)`: checks a not-preserved or not-met counterexample by exact evaluation, with no solver.
- `verifyNoOutcome(finding, model, fragments, solver)`: checks that a joint-conflict input really has no valid outcome, with a fresh, unminimised query.
- `createTestRepo(parent, identities)`, `TestRepo`, `gpgAvailable()`: a temporary git repository with test-only gpg keys in a temporary `GNUPGHOME`.
- `src/run-fixtures.ts`: a script that runs some or all fixtures and prints a summary (`node packages/testkit/src/run-fixtures.ts [F10 F11 ...]`).

## Depends on and used by

- Depends on: every runtime workspace package: `@csh/kernel`, `csl`, `@csh/emit`, `@csh/print`, `@csh/solver`, `@csh/check`, `@csh/witness`, `@csh/adapter-witness-files`, `@csh/adapter-ears-markdown`, `@csh/ledger`, `@csh/gate`, `@csh/component` and `@csh/run`. External: `git` and `gpg` for the ledger fixtures; Vitest and fast-check in its tests.
- Used by: no workspace package. The root test run executes its tests.

## Invariants it protects

- A finding the solver reports is checked again outside the minimiser: counterexamples by exact evaluation, joint conflicts by a fresh query (P8, CSH-019).
- Each fixture is an accepting or rejecting test of the documents, named by stage and section, so a regression in any earlier stage fails the run (P8).
- A fixture with `inputs/component.json` runs with that manifest, so the component errors and the `unowned-source` gap are compared like any other result.
- Printing then emitting reproduces the digest of every fixture model without packs and of random models, so what a person approves is what was emitted (P1, CSH-017).
- Signing keys are test-only and live in a temporary keyring that is deleted afterwards; nothing touches the real repository's keys, commits or `csh/maintainers.json` (P6).
- Before stage 7, fixtures stand in for the ledger with `inputs/authority.json`; from stage 7 on they use a real, signed ledger, so the authority rules are tested against git (P1, CSH-016).

## Rationale

The fixture runner checks results independently of the code under test ([ADR-26](../../docs/adr/ADR-26-fixture-runner.md)). Vitest and fast-check are the test tools ([ADR-17](../../docs/adr/ADR-17-toolchain.md)). All nine stages are built and tested together ([ADR-03](../../docs/adr/ADR-03-all-stages-end-to-end.md)). The authority stand-in is [A-14](../../ASSUMPTIONS.md); packs are outside the printer round trip ([A-21](../../ASSUMPTIONS.md)); an expected finding's context must be a subset of the reported one ([A-27](../../ASSUMPTIONS.md)).

## How it is tested

- `test/fixtures.test.ts`: one test per fixture directory: F01 to F16, F20 to F24, F30 to F35, F40 to F46, F50 to F52, F60 to F64 and F70 to F78, and F80 to F96 from the anchor design. A fixture of a stage not yet built is listed as skipped. The stage of each comes from its `expected.json`, and the stage to package mapping is in the Implementer's brief, section 7.
- `test/roundtrip.test.ts`: the printer round trip on random models (fast-check) and on every fixture model that emits without packs.
- `test/docs.test.ts`: every package has a README with the eight template headings and is named in `docs/architecture/containers.mmd`; every container has a component diagram; every cited decision record, assumption and question exists.
- Ledger fixtures need gpg. They are skipped only when `CSH_ALLOW_GPG_SKIP=1`; otherwise a missing gpg fails the test.

## Known limits

- Most comparisons are inclusion checks: an extra finding, gap or error passes unless the fixture sets `findingsExact` or lists the item as one that must be absent.
- Only the OpenPGP signing path is exercised; SSH signing is not ([A-26](../../ASSUMPTIONS.md)).
- Scratch files go under `.csh-cache/` inside the workspace, so that generated specifications can resolve `csl`.
