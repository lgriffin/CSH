# Stage 45: The second round of real runs

**Exit:** the problems Leigh's Windows re-run of the six repositories found are fixed or answered
([13](../spec/13-from-real-runs.md), section 8; [issue 66](https://github.com/lgriffin/CSH/issues/66)).

**Status:** exit reached. The tests are in:
- `packages/run/test/coverage.test.ts`
- `packages/run/test/propose.test.ts`
- `packages/run/test/safety.test.ts`
- `packages/check/test/render.test.ts`
- `packages/check/test/overview.test.ts`
- `packages/cli/test/cli.test.ts`

## Built

- `run`:
  - `trackedDirsOf`; `filesAt` enters no directory without a tracked file when the tracked list is known
    ([A-160](../../ASSUMPTIONS.md))
  - `coverageOfSources` reads tracked files only
  - `subjectWarnings` asks a path subject for its origin
  - `idPatternOf`
  - fixtures and dot-directories are not tests
- `check`: `claimSpans` returns each claim's values; `lineHolding` finds the line that holds them
  ([A-161](../../ASSUMPTIONS.md)). The overview places the step signals.
- `cli`:
  - claim lines show the line that holds the value
  - the coverage line names the three largest unread kinds

## Not done

- One false positive came from a claim whose span is an issue's wording. Claims come from the profile, not from CSH,
  so the fix is to remove that claim from the profile.
- The proposal still leaves out settings that a hand-written profile sets: `headings`, `tagCites`, `citePattern`,
  `silence`. Each needs the reader's judgement.
