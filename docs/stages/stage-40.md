# Stage 40: Warm runs and history clones

**Exit:** a warm run asks git only what cannot be kept, the tool's adapters share one process, and `csh history`
clones the subject once ([13](../spec/13-from-real-runs.md), section 3; [issue 66](https://github.com/lgriffin/CSH/issues/66), section 4).

**Status:** exit reached. On a proposed profile of CSH's own checkout with history (1,055 tracked files, 525 read), a
warm run fell from 4.5 s and 152 git calls to 2.0 s and 14. Unit tests in `packages/run/test/speed.test.ts`.

## Built

- `run`: `runComponent` takes the project the command loaded. A fetched subject is not walked for ignored files, and
  a file a source would read that the subject's commit does not hold is left out with the warning `untracked-file`
  ([A-146](../../ASSUMPTIONS.md)). `runIsolatedBatch` runs the tool's adapters in one sandbox
  ([A-147](../../ASSUMPTIONS.md)). The history cache keeps each file's commits and whether a path was ever held;
  prefetch resolves bare file names; a release's checkout is a worktree of the pinned one ([A-148](../../ASSUMPTIONS.md)).

## What the tests revealed

- The subject test that refused an ignored file in a fetched checkout was protecting a real property: a source reads
  the file system, so an ignored file would enter the run with the commit's snapshot. Dropping the walk alone would
  have lost it. Filtering what sources read through `git ls-files` keeps the property for the files that matter, at
  the cost of one `ls-files` the run already made.
- Warm runs were slow because the cache kept blame but not `rev-list` per file: 111 of 152 calls on a warm run.

## Not done

- No fixture: nothing here changes a report, and the golden fixtures pass unchanged.
- The fixed calls per run (`rev-parse` and `--show-prefix` in several places) are fewer, since the project is loaded
  once, but not memoised across packages: a cache that outlives a checkout change inside one command (as `csh history`
  makes) would answer wrongly.
