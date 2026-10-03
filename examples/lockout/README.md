# Lockout example

One behaviour, sign-in lockout, described by three practices that are each meant to pin behaviour down and to
agree with the others:

- `docs/requirements.md`: the product owner's requirements in EARS form, cited by the predicates in `spec/lockout.csl.ts`.
- `features/lockout.feature`: the BDD scenarios the three amigos agreed, read by `@csh/adapter-gherkin` through the example's step table, `csh/steps.ts`.
- `test/lockout.test.ts`: the developer's unit tests, written test first, recording witnesses to `reports/witnesses.ndjson` through a probe.

Each is signed off on its own terms: the tests pass, the scenarios are agreed, and the sentences are reviewed. The
harness reads the scenarios rather than executing them. Read together, the three disagree in nine places.
[docs/lockout-walkthrough.md](../../docs/lockout-walkthrough.md) runs the harness on it with real output, and
[docs/lockout-a3.md](../../docs/lockout-a3.md) is the Lean A3 that reads the findings as one problem.

The example is one run in four stages, each an overlay applied as a commit on top of the last:

| Stage | Overlay | What changes | Result |
| --- | --- | --- | --- |
| Before | the files above | Nothing | 16 signals, 4 conflicts, 1 divergence |
| Countermeasures | `countermeasures/` | The A3's countermeasures C2 to C6 | No conflicts; every rule unknown |
| Model and approval | `model/` | A model of the sign-in, then nine approvals signed by a throwaway key | Every rule satisfied; enforcing gate allows |
| Regression | `regression/` | Code and test edited together back to three allowed | Tests green; enforcing gate blocks |

`a3/` builds [the A3](../../docs/lockout-a3.md) from the four stages' reports and the judgments in `a3/a3.json`.
`walkthrough.sh` runs all of it and fails if the committed A3 is out of date; `walkthrough.sh --update` rewrites it.
This is the example to change first when the harness changes: run it, and the A3's diff shows what moved.
