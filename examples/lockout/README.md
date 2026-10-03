# Lockout example

One behaviour, sign-in lockout, described by three practices that are each meant to pin behaviour down and to
agree with the others:

- `docs/requirements.md`: the product owner's requirements in EARS form, cited by the predicates in `spec/lockout.csl.ts`.
- `features/lockout.feature`: the BDD scenarios the three amigos agreed, read by `@csh/adapter-gherkin` through the example's step table, `csh/steps.ts`.
- `test/lockout.test.ts`: the developer's unit tests, written test first, recording witnesses to `reports/witnesses.ndjson` through a probe.

Each is signed off on its own terms: the tests pass, the scenarios are agreed, and the sentences are reviewed. The
harness reads the scenarios rather than executing them. Read together, the three disagree in nine places.
[docs/lockout-walkthrough.md](../../docs/lockout-walkthrough.md) runs the harness on it with real output, and
[the A3](csh/a3/three-practices/a3.md) reads the findings as one problem.

The example is one run in four stages, each an overlay applied as a commit on top of the last:

| Stage | Overlay | What changes | Result |
| --- | --- | --- | --- |
| Before | the files above | Nothing | 16 signals, 4 conflicts, 1 divergence |
| Countermeasures | `countermeasures/` | The A3's countermeasures C2 to C6 | No conflicts; every rule unknown |
| Model and approval | `model/` | A model of the sign-in, then nine approvals signed by a throwaway key | Every rule satisfied; enforcing gate allows |
| Regression | `regression/` | Code and test edited together back to three allowed | Tests green; enforcing gate blocks |

`csh/a3/three-practices/` is the A3: `judgments.json` holds what only a person can say and the structured rules that
place each signal, and `csh a3 build` writes `a3.json`, `a3.md` and `a3.html` from it and the four stages' records.
`walkthrough.sh` makes each stage a commit, runs it with `csh run`, records it with `csh a3 stage`, and ends with
`csh a3 build --check` and `csh a3 verify`; the committed sheet holds every count, so the script itself decides nothing.
The stage records are written and committed in the scratch repository the script makes, not here, because their
commit hashes differ from run to run. `walkthrough.sh --update` rewrites the committed sheet.
This is the example to change first when the harness changes: run it, and the A3's diff shows what moved.

## Containers it exercises

Checked against [the container diagram](../../docs/architecture/containers.mmd) and the commands this example runs
(`packages/testkit/test/triangle.test.ts`).

- `cli`: the `csl` and `csh` commands
- `kernel`: the model, canonical JSON and digests, under every command
- `emission`: `csl emit`, and the emission inside every evaluation
- `adapters`: the witness, EARS and Gherkin adapters, inside every evaluation
- `check`: the queries, the gap view and the report
- `gate`: the gate decision
- `run`: `csh run`: harness, sources, check, gate and the stored record
- `component`: `csh/component.json`, read by `csh run`
- `ledger`: `csh approve` drafting ledger lines, and authority from signed commits
- `a3`: `csh a3 stage`, `build` and `verify`
- `harness`: the probe in the unit tests, and the reporter
