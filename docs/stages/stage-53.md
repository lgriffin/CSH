# Stage 53: The third round of real runs

**Exit:** what Leigh's Windows re-check of stage 46 found is fixed or answered
([13](../spec/13-from-real-runs.md), section 9; [issue 66](https://github.com/lgriffin/CSH/issues/66)).

**Status:** exit reached. Stage 53 has no fixtures of its own, so `BUILT_THROUGH_STAGE` stays at the Assertion
Ladder's 50. The tests are in:
- `packages/check/test/render.test.ts`
- `packages/arch/test/claims.test.ts`
- `packages/run/test/safety.test.ts`
- `packages/testkit/test/gpg.test.ts`
- `packages/cli/test/history.test.ts`

## Built

- `check`: `lineStating` finds the line stating a value in digits, as a version without trailing zeros, or as a word;
  `claimEvidence` gives the reason with the shown line in place of the span, and labels a span whose block states no
  value ([A-163](../../ASSUMPTIONS.md))
- `arch`: negated claims and claim conflicts in words ([A-164](../../ASSUMPTIONS.md))
- `run`: `runWarnings`; the fetch records the subject's visibility ([A-165](../../ASSUMPTIONS.md))
- `testkit`: `gitForWindowsGpgDir`; `gpgAvailable` uses it on Windows ([A-166](../../ASSUMPTIONS.md))
- `cli`: claim lines from `claimEvidence`; the run's warnings from `runWarnings`

## Not done

- A claim citing a tracker item comes from the profile's `csh/claims.json`; the fix is in the profile.
- A profile's own span for a claim (`docs/contract.md:36` for a value stated on line 3) is shown as given, labelled
  when its block states no value; CSH does not search the rest of the file.
