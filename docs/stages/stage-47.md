# Stage 47: Rungs

**Exit:** F150. Every told rule of a report has the highest rung its evidence establishes, the overview and `csh ladder`
show it, and a profile's expected results can hold it ([15](../spec/15-assertion-ladder.md), sections 3 and 6).

**Status:** exit reached.

## Built

- `check` (`ladder`): `rungsOf` over the items, what trace says checks each one (`TraceResult.checks`: test files,
  scenarios, rules and "Verified by"), the examples, and the assessed fragments with their authority. `Report.rungs`.
- `check` (`overview`): `ladder`, `rungs` and `rung` on entries; one line of text after the counts, and a tile per
  rung and a badge per entry in the HTML sheet.
- `check` (`expect`): `rungs` in `csh-expected/v1`, compared like any other expectation.
- `cli`: `csh ladder [--run] [--json]`.
- `testkit`: `rungs` and `ladder` in a `run` fixture's expectation, and `authority.approve` to approve fragments in
  the stand-in. `BUILT_THROUGH_STAGE` is 48.
- [A-160](../../ASSUMPTIONS.md) and [A-161](../../ASSUMPTIONS.md).

## What the fixture revealed

- A candidate rule that cites a requirement used to look like enforcement. F150's `R-A-5` is cited only by a candidate
  rule and stays L2, still the gap `unverified`; that is the line between CSH's reading of a repository and the
  repository's own assertion, and it is the whole reason a profile's rules never raise a rung ([Q-42](../../QUESTIONS.md)).
- On the lockout walkthrough's approved stage, `csh ladder` puts LCK-004 and LCK-005 at L2 (uncited) and three
  sentences at L4. The two gaps were already reported; the rung says the same thing from the other side.

## Not done

- L4 for a test whose failure message names the rule cannot be read statically ([Q-43](../../QUESTIONS.md)).
