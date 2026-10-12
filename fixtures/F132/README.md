# F132

Traceability past the file. A checkout feature and a refunds feature share the numeric prefix `0001`, which the
scenarios practice's `fileId` reads as each file's identity, so both carry `fileId` 0001 and the run warns
`duplicate-file-id`. The checkout feature's description cites ADR-1 and the ADR's path under `Decisions:`, and its
second rule, R-2, cites ADR-1 under `Specified by:`: each is a `decided-by` edge, and the file edge is not checked
here since the fixture is not a repository. R-2 has no scenario, so it stays `unverified`, its detail naming ADR-1 as
cited and not verified.

`steps/checkout.steps.ts` loads the checkout feature by its path from the root (a `loads` edge that resolves) and
defines its steps with jest-cucumber's lower-case `given`, `when` and `then`, one of them a regular expression.
`steps/refunds.steps.ts` defines cucumber-js steps with Cucumber expressions. Every checkout step matches a
definition: the background's `a cart with 2 items` the regular expression, `the shopper pays "card"` the `{string}`
expression, and the outline's two rows `the shopper adds 1 items` and `... 3 items` the expression
`the shopper adds {int} item(s)`. The refunds step `the shopper asks for a refund` (line 5) matches none, an
`undefined-step` gap of its scenario, and `the receipt is emailed` (line 7 of the refunds steps) is used by no step, an
`unused-step-definition` gap. `steps/missing.steps.ts` loads `../features/0002-gone.feature`, read from its own
directory as `features/0002-gone.feature`, which is no feature: a dangling reference.

`e2e/cart.spec.ts` is a Playwright spec: `test.describe` is a describe, so the file declares one test, and the tag
options cite REQ-2 (from `@req-2`, upper-cased) and REQ-3. Its Playwright JSON report names the spec from the
report's `rootDir`, so the result joins the file and REQ-2 and REQ-3 each count one passed test. The cucumber-js JSON
report gives two results in the checkout feature (the background is not one), one passed and one failed, both
citing REQ-1 by its tag, so the feature is a `failing-test` gap naming REQ-1; the refunds scenario, with an undefined
and a skipped step and none failed, is skipped.

From real runs ([13](../../docs/spec/13-from-real-runs.md)), section 5; stage 42.

The expected result was written from the documents before the fixture was first run.
