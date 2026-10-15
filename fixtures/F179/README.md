# F179

Rule tags, test fixtures, and scenarios bound by a test's title ([17](../../docs/spec/17-from-the-tutors-run.md),
sections 1 to 3; stage 61). The subject is a small reader read cold.

- Each Rule of the real features carries its own `@rule-NNNN` tag. The audit fixture under
  `tests/suite-health/fixtures` repeats `@rule-0009` on purpose; it is not one of the subject's features, so it does not
  stop the proposal guessing `idTag (rule-[0-9]+)`, and nothing in it is reported.
- `apps/reader/tests/e2e/search.spec.ts` tags its test `@rule-0001`, which the test adapter upper-cases to `RULE-0001`.
  That resolves to the Rule `rule-0001` with case ignored, so the spec names nothing missing.
- The test's title is the title of the scenario under `rule-0001`, so that scenario is bound by the test and its steps
  are not matched against step definitions. The scenario under `rule-0002` has no test of its title: two of its steps
  match no definition, an `undefined-step` gap. `course.steps.ts` defines both steps of `course.feature`, so nothing is
  unused.

The expected result was written from the specification before the code.
