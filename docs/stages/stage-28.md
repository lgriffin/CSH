# Stage 28: The ESI.ts profile and its A3

**Exit:** CI runs the profile green, and each of the eleven rows is either reported or listed as unknown with a reason.

**Status:** exit reached. The job `Subject (ESI.ts)` fetches ESI.ts at `2a2da8a`, runs the profile, and `csh expect` finds every expectation of [`subjects/esi-ts/csh/expected.json`](../../subjects/esi-ts/csh/expected.json) met: nine rows reported in full, and rows 7 and 9 reported with one or two parts listed as unknown, each with its reason. The overview counts 114 gaps, 8 indeterminate and 43 converged. The job then rebuilds the prose-drift A3 from one run per release, v10.0.0 to v11.3.0, and fails if the committed sheet differs.

## Built

- `adapter-items`: the structured trace adapter `@csh/adapter-items/yaml`, for the source kind `Traces` and the practice kind `traces`. It reads a YAML subset, with no library, into items of kind `property` and the edges the practice maps ([A-122](../../ASSUMPTIONS.md)).
- `check`: a property no scenario or test cites is `unverified`, or a `justified-gap` when it records a silence with a reason; the overview counts a justified gap as converged ([A-123](../../ASSUMPTIONS.md)). This reports row 10.
- `witness`, `run`, `cli`: `csh-results/v1` and `csh results import`, which reduce a runner's report to paths, counts and cited identifiers at a commit; the tests adapter joins a reduced file only at its commit ([A-124](../../ASSUMPTIONS.md)). ESI.ts's results are committed this way, as `subjects/esi-ts/csh/results.json`.
- `check`, `cli`: `csh-expected/v1` and `csh expect` ([A-125](../../ASSUMPTIONS.md)).
- CI: the job `Subject (ESI.ts)`. A failed fetch fails it; it is never skipped.
- `subjects/esi-ts/csh/a3/prose-drift`: an A3 of twelve releases, with candidate judgments written by an agent ([A-126](../../ASSUMPTIONS.md)).
- The README's fourth door: CSH as a static analysis tool.

## The eleven rows

| Row | Reported as | Unknown, with the reason |
| --- | --- | --- |
| 1 | 2 `claim-conflict`, 2 `fact-conflict` | |
| 2 | `dangling-reference` at `guides/CHARTER.md:201` | |
| 3 | `fact-conflict`, `claim-conflict` | |
| 4 | `fact-conflict` | |
| 5 | `stale-prose` at `guides/CHARTER.md:896` | |
| 6 | `fact-conflict`, `stale-prose` | |
| 7 | `fact-conflict` (the unit tier), and the CI job count indeterminate | The CI job count: no adapter reads workflow files, so its claim is an atom. The exclusion Rule count: no fact counts Rules by form, so no claim is written |
| 8 | `fact-conflict` | |
| 9 | `unverified` ARCH-03, and its layering rule `satisfied` | A `status-unsupported` finding: ARCH-03's stated status is Practised, so no status is unsupported |
| 10 | 3 `justified-gap`, converged | |
| 11 | `claim-conflict`, `fact-conflict` | |

## What ESI.ts revealed

- **The security model is the best-traced practice in ESI.ts.** Its 12 properties name 29 tests and requirements, and scenarios cite P1 to P9 by tag 20 times. P2, P4 and P7 name test files the unit run does not report, so they are indeterminate; 7 of its lines name files changed since.
- **Stale prose grows with every document added.** The prose-drift A3 counts 31 stale items at v10.0.0, when the charter arrives, 66 at v11.0.0, when the guides double, and 82 at v11.3.0. No release lowered the count. Four of the eight refuted claims are older than the code that refutes them.
- **Most of what ESI.ts's tests say is about no requirement.** Of 8,805 tests, 143 cite an identifier in their names; the reduced results file is 68 KB where the report was 3.9 MB.

## What proved wrong or costly in the documents

- The plan named the CI job's inputs but not the results. A report names the subject's tests, which cannot be committed, and a CI job that ran ESI.ts's tests would need its dependencies and a git clone. The reduced file answers both: committed once per pinned commit, and joined only at it.
- The plan said the profile commits "expected results" without saying what is compared. Comparing the report would quote ESI.ts; comparing the eleven rows alone would let the rest drift. The overview's entries and counts are both small and free of the subject's text.
- The A3 was planned as committed whole. Its stage reports quote ESI.ts, so only its judgments and sheet are committed, and CI rebuilds the stages.

## What remains

- BDD results are still not joined to scenarios (ESI.ts [#640](https://github.com/lgriffin/ESI.ts/issues/640)).
- A `dangling-reference` to a deleted file is still not told apart from one that never existed.
- The tool-code digest of the source cache uses file sizes and modification times.
- The releases A3 of stage 25 has no judgments and stays local.

## Effort

About 700 lines of source and 250 lines of tests. Effort was not timed.
