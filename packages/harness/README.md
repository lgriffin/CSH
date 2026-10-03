# @csh/harness

## Purpose

`@csh/harness` records what a practice did without asserting anything. It has two parts. The probe wraps the function under test once and records every call as a version 2 witness, carrying the test's identity and no outcome. The reporter for Node's built-in test runner writes one execution line per finished test, so that the witness adapter can join each witness to its test's true outcome ([09](../../docs/spec/09-anchor-harness-a3.md), sections 3.1 and 3.2). [The probe guide](../../docs/guides/probe.md) shows how to write one.

## Where it sits

It is the "Harnesses" container, shown in the [containers diagram](../../docs/architecture/containers.mmd). Its components (probe, test identity, reporter) are in [components-harness.mmd](../../docs/architecture/components-harness.mmd). It runs inside the project's own test process, started by `csh run` through a practice's harness command, and is not trusted: it can lose a witness, but it cannot make an obligation satisfied, because every witness is still judged by the check engine.

## Public interface

- `probe(event, fn, mappers, ctx?)`, `Probe`, `ProbeMappers`, `ProbeContext`: wrap `fn`; `probe.in(t, { cites })` returns the function, recording each call made by the test `t`. The mappers `pre`, `args`, `post` and `result` are the only place that names witness keys; `mocked` lists the test doubles the author states.
- `witnessId(fullName)`: the witness id from the test's full name, numbering later calls in the same test.
- `testIdentity(file, fullName, cwd?)`: the identity shared by witnesses and execution lines ([A-39](../../ASSUMPTIONS.md)).
- `@csh/harness/reporter`: the default export is a reporter for `node --test` that writes csh-execution/v1 lines to `CSH_EXECUTIONS_FILE` (default `reports/executions.ndjson`) and prints nothing. Run by hand before `csh check`, its file must be named explicitly, as a practice's `executions` or `csh/config.json`'s `executions`: no file is joined to a Witnesses source that names none ([A-62](../../ASSUMPTIONS.md)). `executionOf(event, fullName)` and `nameTracker()` are its parts.
- `HARNESS_TOOL`: the tool id written into each witness.

## Depends on and used by

- Depends on: `@csh/witness` (`buildWitness`, the record and execution types). External: Node's test runner, through the events it gives a reporter.
- Used by: the tests of `examples/account` and `examples/lockout`, and any project whose practice names the reporter in its harness command. No workspace package imports it at run time.

## Invariants it protects

- The probe calls the real function with the real arguments and returns its real result: it never asserts, retries or alters behaviour (section 3.4).
- The probe writes no outcome. Only the test runner knows whether a test passed, so the outcome comes from the reporter or not at all (P2).
- The probe fills in nothing it did not observe: a call that throws records nothing, and `mocked` is what the author states, since a probe cannot detect a test double (P10).
- `pre` and `args` are read before the call, so a function that mutates its argument cannot change what was recorded as its input.
- The reporter appends to its executions file and never truncates it, so two harnesses sharing the file within one `csh run` (which clears it once, first) both keep their lines. Run twice by hand, it accumulates lines: a pass followed by a fail gives one identity two outcomes, which the witness adapter reports as `ambiguous-test-identity` and reads as unknown. Appending fails safe; delete the file before running it by hand ([A-63](../../ASSUMPTIONS.md)).
- Suites and skipped tests get no execution line; a failure in the test's own code is `failed`, and any other failure (hook, timeout, cancellation) and a todo test are `errored`, so neither can become a claim.

## Rationale

A hand-built record lets a test say anything about itself, and its default outcome of `passed` was a guess. Splitting the record (the probe) from the outcome (the runner) leaves each to the only party that observes it. Version 1 ships a reporter for Node's test runner, which the repository uses; other runners need their own ([ADR-12](../../docs/adr/ADR-12-adapters-outside-core.md)).

## How it is tested

- `test/harness.test.ts`: test identity; the probe returns the real result and records a version 2 witness with no outcome; an awaited result is recorded and a throwing call is not; witness ids number later calls; the reporter's outcome mapping for a pass, a failure in the test, another failure, a todo, a skip and a suite; full names from enclosing tests, per file; a real run of `node --test` whose execution lines and witnesses join by identity; and two runs whose lines both stay in the file.
- Fixtures F82 to F85 cover the join and the two gaps it adds (`outcome-unknown`, `unobserved-test`).
- `examples/account/walkthrough.sh` and `examples/lockout/walkthrough.sh` run the probe and the reporter.

## Known limits

- Witness ids come from test names, so two test files with a test of the same full name writing to one witness file give a duplicate id, which the witness reader reports.
- Only Node's built-in test runner has a reporter.
- A test that calls the probed function inside a helper with its own test context must pass the right `t`; the probe cannot find it.
