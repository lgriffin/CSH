# Stage 42: Traceability past the file

**Exit:** a Playwright tag option cites, cucumber-js and Playwright reports give outcomes, a steps file is linked to
the feature it loads, scenario steps are matched to step definitions, features cite decisions, and two features with
the same identity collide ([13](../spec/13-from-real-runs.md), section 5; [issue 66](https://github.com/lgriffin/CSH/issues/66), section 3).

**Status:** exit reached. Fixture [F132](../../fixtures/F132/README.md); unit tests in
`packages/adapter-items/test/traceability.test.ts` and `packages/check/test/steps.test.ts`.

## Built

- `adapter-items` (`tests`): tag options and `test.describe` ([A-152](../../ASSUMPTIONS.md)); `loadFeature` edges,
  lower-case step functions in a file that loads a feature, and each definition's pattern kept as the attribute
  `stepDefinitions` ([A-154](../../ASSUMPTIONS.md)).
- `adapter-items` (`gherkin`): each scenario keeps its steps (backgrounds first, outlines expanded by their examples)
  as the attribute `steps`; `decisionsField` and `fileId` ([A-155](../../ASSUMPTIONS.md)); results joined by feature
  file ([A-153](../../ASSUMPTIONS.md)).
- `witness`: cucumber-js and Playwright JSON readers, used by `csh results import` and by a practice's `executions`
  ([A-153](../../ASSUMPTIONS.md)).
- `check` (`steps`): Cucumber expressions, and the gaps `undefined-step`, `unused-step-definition` and
  `steps-undecided`. `trace` names a rule's decisions on its `unverified` gap as cited and not verified.

## What the tests revealed

- A module-level regular expression with the global flag, tested once per file, kept its position into the next file,
  so the second steps file's `loadFeature` was missed. F132 found it; the test is now a fresh expression.

## Not done

- Steps are matched against every definition in the run, which is how cucumber-js binds them. jest-cucumber binds a
  feature's steps only to the file that loads it, so a step defined in the wrong file is not found there.
- A Cucumber expression's custom parameter types are read as `{}`: what they match is defined in code CSH does not
  run.
