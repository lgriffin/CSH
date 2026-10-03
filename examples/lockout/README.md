# Lockout example

One behaviour, sign-in lockout, described by three practices that are each meant to pin behaviour down and to
agree with the others:

- `docs/requirements.md`: the product owner's requirements in EARS form, cited by the predicates in `spec/lockout.csl.ts`.
- `features/lockout.feature`: the BDD scenarios the three amigos agreed, read by the project-local adapter `adapters/gherkin.ts`.
- `test/lockout.test.ts`: the developer's unit tests, written test first, recording witnesses to `reports/witnesses.ndjson`.

Each practice is green on its own terms. Read together they disagree in nine places.
[docs/lockout-walkthrough.md](../../docs/lockout-walkthrough.md) runs the harness on it with real output, and
[docs/lockout-a3.md](../../docs/lockout-a3.md) is the Lean A3 that reads the findings as one problem.

`countermeasures/` holds the same files after the A3's countermeasures. `walkthrough.sh` runs the example, applies
them as one commit, and checks again.
