# Stage 54: The fourth round of real runs

**Exit:** what Leigh's Windows re-check of stage 53 found is fixed or answered
([13](../spec/13-from-real-runs.md), section 10; [issue 66](https://github.com/lgriffin/CSH/issues/66)).

**Status:** exit reached. Stage 54 has no fixtures of its own, so `BUILT_THROUGH_STAGE` is unchanged. The tests are in:
- `packages/check/test/render.test.ts`
- `packages/run/test/safety.test.ts`
- `packages/cli/test/history.test.ts`

## Built

- `vitest.config.ts`: two workers on Windows ([A-185](../../ASSUMPTIONS.md))
- `check`: `linesStatingVersion`; `claimEvidence` names where else a version is stated ([A-186](../../ASSUMPTIONS.md))
- `run`: `subjectWarnings` leaves out the private warning when git ignores the manifest ([A-187](../../ASSUMPTIONS.md))
- `cli`: the run says why no harness ran ([A-188](../../ASSUMPTIONS.md))

## Not done

- A count claim still points at the heading of the list it counts. No line states the count, so there is no better
  line to show.
- The two-worker setting cannot be checked from Linux CI; the Windows CI job already ran with two.
