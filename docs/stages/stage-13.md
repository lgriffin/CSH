# Stage 13: Divergence

**Exit:** F87 to F90, plus every earlier fixture and both walkthroughs.

**Status:** exit reached.

## Built

- `solver`: Q-DIV(E1, E2), `qDiv` and `exampleInputF`. Wanted when the two inputs cannot meet; failed, with both examples and a shared input, when they meet and the outcomes cannot both hold ([ADR-34](../adr/ADR-34-example-divergence.md)).
- `check`: the Q-DIV loop over pairs of examples of one event from different source columns, the finding kind `example-divergence` with `inputs: identical | overlapping`, and the conflict on an event declared `deterministic` with identical inputs. The report renders a "Divergences between examples" section with four readings, and the counts line gains `example-divergence`. `signalsOf(report, manifest)` and `matches` moved in from the lockout example, with the structured `Signal` and `Match` of section 5.3.
- `kernel`, `csl`, `print`: `deterministic: true` on an event. S1 refuses any other value in the IR; the printer prints it; it joins the event's dependency digest only when true, so no existing digest moved.
- `cli`: `csh explain` shows the inputs, a shared input and the four readings; the `csh run` summary splits findings into conflicts and divergences.
- `testkit`: `BUILT_THROUGH_STAGE` is 13, and an expected finding's `inputs` is compared.

## The three corners

- C4: [components-check.mmd](../architecture/components-check.mmd) names Q-DIV and the signals component.
- Docs: the check, solver, kernel, csl and print READMEs; [ADR-34](../adr/ADR-34-example-divergence.md); [A-44](../../ASSUMPTIONS.md); the account walkthrough explains its new divergence; the lockout walkthrough's "BDD against TDD" paragraph now describes the query, not its absence.
- Examples: the lockout walkthrough's `expect` lines and the A3's placing rules include the new kind. The example's A3 builder reads signals from `@csh/check` and keeps its text rules until stage 14 replaces them with structured matches.

## What moved on the lockout sheet

- Before the countermeasures: 15 signals became 16. The new one is the divergence between the scenario `ThirdFailedAttempt` and the unit test that allows a third failure, with overlapping inputs.
- After the regression: 10 signals became 12, two divergences between the edited test and the scenarios.
- The cause "A count in prose read two ways" went from 1 signal to 2 before the countermeasures; the decision point "Third wrong password" is now reported directly, where before the harness saw it only through `LockOnThirdFailure`.
- The countermeasure and approval stages are unchanged: their examples agree.
- The account example gained one divergence: the premium overdraw test against the intent's `RejectAtBoundary`, on identical inputs.

## Solver budget

Q-DIV adds one query per pair of examples on one event from different columns. Measured without the cache: 3 queries
in 59 ms on the account example, 16 queries in 135 ms on the lockout example before its countermeasures, none over
35 ms. Each query runs under the existing per-check budget; nothing was raised.

## Effort

Medium: about 120 lines of solver and check code, 90 of signals, small changes in four other packages, and the tests.
One correction round: the lockout walkthrough's expectations failed, as they should, once the new kind appeared, and
the new signal showed as unclassified on the A3 until a rule placed it.

## What the fixtures revealed

- F88: "overlapping" needed a definition. It is everything that is not identical, where identical means both examples state the same fields and arguments with equal values ([A-44](../../ASSUMPTIONS.md)).
- F89: `deterministic` has to stay out of the digest of events that do not declare it, or every fixture model's digest moves.

## What proved wrong or costly in the documents

- Section 6.5 lists amendments to tabs 00 to 08, which this work may not edit. They are recorded in 09 and ADR-34, and the tabs are unchanged; the amendment is lodged as a question for the owner.
- Section 6.1 does not say whether rules and assumptions take part in Q-DIV. They do not, so a pair already separated by a rule is reported once, by Q-EX ([A-44](../../ASSUMPTIONS.md)).
