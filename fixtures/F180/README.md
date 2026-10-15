# F180

Step matching in the step library's own dialect ([17](../../docs/spec/17-from-the-tutors-run.md), section 4; stage 61).
`tests/bdd/steps/release.steps.ts` imports `@amiceli/vitest-cucumber`, so its definitions are read in that library's
dialect.

- `the SLO file committed at release/slo.yaml` matches the identical step: the `/` is literal, not an alternation.
- `{number} objectives are listed` matches `3 objectives are listed`.
- The outline's definition `the course that generator "<release>" wrote` matches the outline's step as written, with
  its placeholder, so neither expanded row is undefined.
- `Given(seed, …)` names a `const` of the same file, whose literal matches the seeding step.
- `And the report is archived` matches no definition, an `undefined-step` gap, and `the report is printed` is used by no
  step, an `unused-step-definition` gap. Nothing is undecided: every definition is readable.

The expected result was written from the specification before the code.
