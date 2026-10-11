# Stage 25: History

**Exit:** rows 5 and 6 of the table in [11](../spec/11-ingesting-a-codebase.md) are reported, and an A3 has a stage
per ESI.ts release from v9.0.0 to v11.3.0.

**Status:** exit reached. `csh run --root subjects/esi-ts` reads ESI.ts's history at `2a2da8a`. Row 5 is a
`stale-prose` gap: gap register row 29, at `guides/CHARTER.md:896`, names `security.test.ts`, and that file changed
after the line. Row 6 is a `fact-conflict` and a `stale-prose` gap on the claim `NodeFloorIs18`: the sentence at
`guides/CHARTER.md:146` dates from `4b3c2b1`, and `package.json`'s `engines` took its present value later, at
`3709c39`. `csh history releases --from v9.0.0 --to v11.3.0` records one A3 stage for each of the 17 releases.

## Built

- `component`: `history` in a version 2 manifest, with `since` a tag, a commit or `previous-tag` ([A-109](../../ASSUMPTIONS.md)).
- `check`: the `HistoryPort`, and three gaps. `stale-prose` covers a line older than the file it names, and a refuted claim older than the code that refutes it ([A-111](../../ASSUMPTIONS.md)). `status-unsupported` covers an `Enforced` requirement that no mechanism supports ([A-112](../../ASSUMPTIONS.md)). `untraced-change` covers a commit that changes the implementation with no test and no `Refs:` trailer, marked when an agent co-authored it ([A-113](../../ASSUMPTIONS.md)).
- `arch`: `ClaimEvidence` on a claim's result, saying where in the code it was decided.
- `run`: `gitHistory`, over blame, `git log -L`, rev-list, the pickaxe and commit trailers. Only hashes, dates and counts leave it. `subjectCommit` reads a commit of the subject other than the pinned one.
- `adapter-items` and `check`: a bare file name in backticks is an edge, resolved when exactly one tracked file has that name ([A-110](../../ASSUMPTIONS.md)).
- `cli`: `csh history <slug> --from --to`, and `csh subject fetch --at`. `csh a3 verify` runs a release's stage again at that release ([A-114](../../ASSUMPTIONS.md)).
- `subjects/esi-ts`: `history.since` is `previous-tag`, the claim `NodeFloorIs18` is added, and the releases A3 stays local.

## What ESI.ts revealed

| Row | Reported |
|---|---|
| 5 | `stale-prose` on the charter document. Line 896 names `security.test.ts`, which is `tests/tdd/core/security.test.ts`, changed in 2 commits since the line. 815 other mentions on 70 other items are stale the same way |
| 6 | `fact-conflict` and `stale-prose` on `NodeFloorIs18`. The two `CircuitOpenError` claims and the 192 unit files are stale too: each sentence is older than the code that refutes it |
| 9 | Not `status-unsupported`. ARCH-03's status is `Practised`, not `Enforced`. PROC-03 is the one `Enforced` requirement that nothing supports: a repository setting, which no file holds |

Over the releases, stale prose grows from 4 items at v9.0.0 to 75 at v11.3.0. The charter arrives at v10.0.0, and from
then on every release only adds to the count. Each release has between 1 and 7 commits that change `src` with no test
and no reference.

## What proved wrong or costly in the documents

- The plan dated a section by its newest line. For row 6 that misses the point: the line was edited on 28 September, after `engines` changed, though its claim about Node 18 was older. Dating each line, and dating a refuted claim's sentence by its first commit, reports both rows.
- Row 5 names its test file by a bare name. A bare name was text before this stage, so history had nothing to date.
- `authoredBy from trailers` would put an unsigned claim beside a signed one. Trailers only mark an untraced change as agent co-authored, and `authoredBy` stays the signer's.
- An A3 stage stores the whole report, and ESI.ts's reports quote it. So the releases A3 cannot be committed to CSH. Only its counts are in [the profile's README](../../subjects/esi-ts/README.md).
- A stored run was found by the profile's commit alone. Once one profile commit had runs of 17 subject commits, `csh a3 stage` could have taken any of them. Stored runs now match the subject's commit too.

## What remains

- A `dangling-reference` to a file that history shows was deleted is still reported like one that never existed.
- `stale-prose` lists every stale line of an item. On ESI.ts's charter that is 816 lines over 71 items, and nothing ranks them yet.

## Effort

About 400 lines of source and 300 lines of tests. Effort was not timed.
