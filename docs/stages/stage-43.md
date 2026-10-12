# Stage 43: Clearer output

**Exit:** the run summary counts errors and warnings apart and shows each refuted claim as its sentence and the fact
that decides it; an A3's many problems are counted by kind; a profile can name placeholders and volatile files
([13](../spec/13-from-real-runs.md), section 6; [issue 66](https://github.com/lgriffin/CSH/issues/66), section 5).

**Status:** exit reached. Unit tests in `packages/cli/test/history.test.ts` (the run summary),
`packages/cli/test/a3.test.ts` (`problemsText`), `packages/check/test/trace.test.ts` (volatile files) and
`packages/adapter-items/test/traceability.test.ts` (placeholders).

## Built

- `cli`: the run summary's `N errors, M warnings`, and claim findings with their sentences ([A-156](../../ASSUMPTIONS.md));
  `csh check` prints the sentences too. Problems with an A3's judgments past ten are counted by kind
  ([A-157](../../ASSUMPTIONS.md)).
- `adapter-items` (`markdown`): `placeholders`; `run` and `check`: `history.volatile` ([A-158](../../ASSUMPTIONS.md)).

## What the tests revealed

- The lockout walkthrough showed the coverage line of stage 38 reading `0 of 15 tracked files read` for a component
  whose specification declares its sources: coverage counts only the sources a manifest declares. The line is now left
  out when the manifest declares none.

## Not done

- No fixture: the changes are to what the command line prints and to two settings that only remove edges; the
  golden fixtures pass unchanged.
- `stale-prose` is not weighted by the number of commits since the line; a profile names its volatile files instead.
