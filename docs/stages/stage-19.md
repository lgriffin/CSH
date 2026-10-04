# Stage 19: Change review

**Exit:** F108 to F112 pass; `csh diff` runs on every pull request of this repository, for the gate component and for
`Workspace`; and the lockout walkthrough prints the diff between each pair of its stages
([10](../spec/10-next-layers.md), section 9). Every earlier fixture and both walkthroughs stay green.

**Status:** exit reached.

## Built

- `review` (new, outside the trusted base): the `csh-diff/v1` model from two stored runs (`diffRuns`) and its rendering (`renderDiff`), sections in the order of section 5.2, `none` for an empty one.
- `cli`: `csh diff <base> <head>`, each side a stored run's directory, a commit, `.` or `unavailable:<reason>`; `--json` and `--out`. The changed paths come from git.
- `run`: `readStoredRun(dir)`, shared by `csh diff` and the fixture runner.
- CI: the Change review job, `.github/scripts/diff-job.sh`. The merge base runs in its own worktree with its own install, the head runs as checked out, and the rendering goes to the job summary with `diff.json`, the report and the decision as an artifact. Read access only; nothing is posted ([A-75](../../ASSUMPTIONS.md)).
- The lockout walkthrough diffs before to countermeasures, countermeasures to approved, and approved to regression, and fails unless they show conflicts cleared, then approvals gained, then exactly one new violation of an approved rule.
- `testkit`: `BUILT_THROUGH_STAGE` is 19; a `diff` expectation for fixtures; the triangle knows the `review` container.

## Fixtures

All five pass: F108 (signals matched by id, one cleared and one appeared), F109 (an approved fragment edited: approval
lost, rendered first), F110 (the base cannot be run: the head alone, never an empty diff), F111 (the implementation and
its tests changed together, the specification untouched, and which practices' inputs changed), F112 (every section
says `none` when nothing moved).

## The three corners

- C4: the container diagram gains `review` and its relations (`cli -> review`, and `review` to `check`, `gate`, `run` and `kernel`); [components-review](../architecture/components-review.mmd) is new and the command line's diagram gains `diff`. The `Workspace` run of the CI job reads the diagram, so an undrawn `review` would show there as `unplaced-package`, as it did before the diagram was updated.
- Docs: [the change review guide](../guides/review.md); the README of `review`; `cli` and `run` READMEs; section 11 of [the lockout walkthrough](../lockout-walkthrough.md); the root README's executed `csh diff` block; [A-84 to A-86](../../ASSUMPTIONS.md).
- Examples: the lockout example exercises `review` through its walkthrough.

## What proved wrong or costly in the documents

- Section 5.2's sections have no place for an approval gained, so a diff between countermeasures and approval would read as almost nothing; the rendering adds "Authority moved" when any rule's authority moved ([A-86](../../ASSUMPTIONS.md)).
- An A3 stage record keeps no model, so its fragments are read from the obligations the report assesses ([A-84](../../ASSUMPTIONS.md)).
- A rule that became unknown carries both bare reason codes and detailed ones; the rendering drops a bare code a detailed one repeats.
- Running the merge base with the head's installed dependencies fails whenever the lockfile moved; the CI job installs the base on its own instead ([A-77](../../ASSUMPTIONS.md)).
