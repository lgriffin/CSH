# ESI.ts, a subject profile

This directory evaluates [ESI.ts](https://github.com/lgriffin/ESI.ts) from outside. ESI.ts is the owner's TypeScript client for the EVE Online ESI API. The profile is pinned to commit `2a2da8a` (v11.3.0). ESI.ts is only read; nothing is written to it ([11](../../docs/spec/11-ingesting-a-codebase.md)).

```
node packages/cli/bin/csh.js subject fetch --root subjects/esi-ts   # clone ESI.ts at the pinned commit
node packages/cli/bin/csh.js run --root subjects/esi-ts             # evaluate it
```

The test results are committed as [`csh/results.json`](csh/results.json): each test file's path and counts, and the identifiers each citing test cites, at the pinned commit, with no test name. To make it again, run ESI.ts's tests in a git clone of the checkout, with its dependencies installed, and reduce the report:

```
git clone .csh-cache/subjects/<commit> /tmp/esi && cd /tmp/esi && npm ci --ignore-scripts
npx jest --config config/jest/unit.config.cjs --json --outputFile=<this directory>/results/jest.json
node packages/cli/bin/csh.js results import tdd subjects/esi-ts/results/jest.json --base /tmp/esi --root subjects/esi-ts
```

Two of ESI.ts's tests read git, so a copy without `.git` fails them. The clone, the runner's report and the run reports stay under this directory's `.csh-cache/`, `results/` and `reports/`, which git ignores, as do the A3 stage records under `csh/a3/*/stages/`. ESI.ts is GPL-3.0 and CSH is MIT, so only identifiers, paths, spans, commits, digests and counts from ESI.ts are committed here, never its text ([#37](https://github.com/lgriffin/CSH/issues/37)).

The expected results are [`csh/expected.json`](csh/expected.json), which `csh expect` compares with the last run, and CI runs the whole profile in the job `Subject (ESI.ts)`.

## What it reads

| Stage | Practice | Source | Result at `2a2da8a` |
| --- | --- | --- | --- |
| 21 | Charter | `guides/CHARTER.md` | 0 items and the warning `no-items`: the 66 requirements are headings, which the EARS adapter does not read yet |
| 22 | Charter | `guides/CHARTER.md`, through the Markdown inventory adapter | 66 requirements and 240 verified-by edges. Eight requirements are `unverified`: ARCH-03, DES-05, DOC-06, PROC-01, PROC-02, PROC-04, PROC-05 and REL-04, each verified by prose alone. DOC-01 is verified by `guides/MUTATION-TESTING.md`, which no longer exists, and the charter names seven other paths that are not tracked |
| 22 | Guides | `guides/**/*.md` but the charter | 29 documents, 81 implements edges, all resolved; 25 backticked paths in 8 guides name no tracked file |
| 22 | BDD | `tests/bdd/features` | 77 features, 619 rules and 792 scenarios; every rule has a scenario |
| 22 | TDD | `tests/**/*.test.ts` but fixtures | 261 test files and 3,902 tests, parameterised ones included; only 10 cite a charter requirement in a title, and 4 declare no test with a literal title |
| 22 | Beads | `.beads/issues.jsonl` | 69 issues, 63 mentions of charter requirements |
| 23 | Code facts | `src/**/*.ts` and `package.json` (since stage 24, also `etc/doc-metrics.json` and `scripts/spec/check-spec-drift.ts`), through `facts-ts` | 288 modules, 1,116 dependencies, 3,024 exports and 35 manifest fields, none skipped, with nothing installed. Lockfile-only commits such as `54f7b20` give identical facts |
| 23 | Layering | [`csh/spec.csl.ts`](csh/spec.csl.ts), three candidate rules over modules | ARCH-03's rule (the request pipeline takes the cache, rate limiter and circuit breaker as parameters) and both ARCH-10 rules (the SDE imports only ports and peers, and nothing imports the SDE) are `satisfied` at `2a2da8a` |
| 24 | Claims | [`csh/spec.csl.ts`](csh/spec.csl.ts), the intent `ProseAboutCode`: eleven candidate claims, each citing a sentence | 7 `fact-conflict` and 4 `claim-conflict` findings for rows 1, 3, 4, 7, 8 and 11; GATE-01's 23 jobs are `unknown`, since no fact holds them |
| 24 | Code mentions | Backticked symbols beside a code file, and `npm run` scripts, in every guide | 451 mentions; all resolve but `buildError` at `guides/CHARTER.md:201`, a `dangling-reference` (row 2) |
| 25 | History | `git` at the pinned commit, with `history.since` the previous tag | 816 mentions on 71 items name a file changed since their line: 46 in the charter, 25 in the guides (`stale-prose`). Row 5 is one: `guides/CHARTER.md:896`, gap register row 29, names `security.test.ts`, which resolves to `tests/tdd/core/security.test.ts`, changed by `4ca8384` after the line |
| 25 | Claims, dated | [`csh/spec.csl.ts`](csh/spec.csl.ts), the claim `NodeFloorIs18` at `guides/CHARTER.md:146` | Row 6: a `fact-conflict`, since `package.json` requires Node 22.12 or later, and `stale-prose`, since the sentence dates from `4b3c2b1` (2026-09-15) and `engines` took that value at `3709c39` (2026-09-27). Three more refuted claims are older than the code that refutes them |
| 25 | Statuses | Charter requirements whose status is Enforced | PROC-03, enforced by a repository setting that no file holds (`status-unsupported`). ARCH-03 is `Practised`, so it stays `unverified` only |
| 25 | Changes | The 2 commits since v11.2.0 that change `src` | `096f9a7` and `7a2f49b` change `src` with no test and no `Refs:` trailer (`untraced-change`); an agent co-authored the first |
| 25 | Releases | `csh history releases --from v9.0.0 --to v11.3.0` | One A3 stage per release, 17 in all, kept under `csh/a3/releases/`, which git ignores since its reports quote ESI.ts. The table below is from it |
| 26 | Test results | `results/jest.json`, from ESI.ts's unit configuration run beside the checkout | 8,805 tests in 308 files, all passed but one skipped. 7,995 ran in 230 of the 261 test files; the other 810 are the BDD suites, which are not test files of this source. 27 test files ran in no configuration read (7 contract, 3 fault, 11 fuzz and 6 integration test files), so their outcomes are unknown. Tests cite 9 of the 66 requirements, the same 9 the titles cite, so no requirement is cited only at run time; no `failing-test` gap, and the 12 findings are unchanged |
| 27 | Overview | `csh overview --root subjects/esi-ts`, after a run with the results file | 143 results: 107 gaps, 5 indeterminate and 31 converged, in `reports/csh-overview.html`. 18 requirements converge through passing test files their "Verified by" names, though no test names them; ARCH-02, TEST-05 and TEST-08 name test files the unit run does not report, so they are indeterminate. A second run with nothing changed takes 2.9 seconds instead of 15.5 |
| 28 | Security model | `guides/security-model.yaml`, through the structured trace adapter | 12 properties, 29 edges to tests and requirements, cited by scenarios 20 times through `@sec-P*` tags. P10, P11 and P12 record why they have no Rule: `justified-gap`, converged (row 10). P2, P4 and P7 name test files the unit run does not report, so they are indeterminate |
| 28 | Expected results | `csh/expected.json`, compared by `csh expect` | 113 gaps, 8 indeterminate and 43 converged; every row reported, rows 7 and 9 with parts unknown, each with its reason (below) |
| 28 | Prose drift | `csh history prose-drift --from v10.0.0 --to v11.3.0` | [The A3](csh/a3/prose-drift/a3.md): stale prose 31 items at v10.0.0, 66 at v11.0.0 and 82 at v11.3.0, never lower; candidate judgments written by an agent |
| 72 | Tests exercise prose | The symbols the guides name in backticks, against what the code of every test file mentions | 49 converged: 6 more, each a document whose every named symbol a test of its language mentions (`exercised`), such as `guides/SECURITY.md`'s `buildCacheKey`, `sanitizeUrl` and `validateBaseUrl` |

Stage 22 reports half of row 9: ARCH-03 is `unverified`. Stage 23 reports the other half: ARCH-03 can be checked, and its rule holds. The charter still says code review is the only check, and ARCH-03 stays `unverified` until a person approves the rule. Stage 24 reports what the prose says about the code where the code can answer: seven claims are refuted and four pairs contradict each other. That ARCH-03's status contradicts a satisfied rule is not one of them, since a requirement's status is not yet a fact. The `dangling-reference` gaps for files that were deleted, such as `guides/MUTATION-TESTING.md`, need history to tell a stale mention from a mention of a deletion, and DOC-01 is the second kind. That is stage 25's.

Stage 25 reads history. A line that names a file is dated by blame, and is stale when the file changed after it; a refuted claim is stale when the code that refutes it is newer than its sentence. That reports rows 5 and 6. `csh history` then runs the same profile at every release from v9.0.0, and each run is a stage of one A3:

| Release | Commit | Items | `stale-prose` | `status-unsupported` | `untraced-change` | `unverified` | `dangling-reference` | `fact-conflict` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v9.0.0 | `828ee53` | 513 | 4 | 0 | 2 | 0 | 1 | 4 |
| v9.1.0 | `ac40917` | 530 | 4 | 0 | 2 | 0 | 1 | 4 |
| v9.4.0 | `f73e404` | 574 | 4 | 0 | 5 | 0 | 1 | 4 |
| v9.6.0 | `71d90ad` | 593 | 4 | 0 | 2 | 0 | 1 | 3 |
| v9.7.0 | `a79020a` | 612 | 4 | 0 | 7 | 0 | 2 | 3 |
| v10.0.0 | `978cce2` | 1,209 | 31 | 5 | 5 | 15 | 8 | 3 |
| v10.1.0 | `437b497` | 1,262 | 31 | 5 | 2 | 15 | 7 | 3 |
| v10.1.1 | `0cae811` | 1,262 | 31 | 5 | 1 | 15 | 7 | 3 |
| v10.2.0 | `bb02a29` | 1,263 | 31 | 5 | 1 | 15 | 7 | 3 |
| v10.2.1 | `6374596` | 1,264 | 32 | 5 | 2 | 15 | 7 | 3 |
| v10.2.2 | `fa6cc0c` | 1,264 | 32 | 5 | 1 | 15 | 7 | 3 |
| v10.2.3 | `cb71010` | 1,264 | 32 | 5 | 1 | 15 | 7 | 3 |
| v11.0.0 | `3bdd8ad` | 1,766 | 66 | 1 | 7 | 8 | 9 | 8 |
| v11.1.0 | `33b5fcb` | 1,799 | 68 | 1 | 1 | 8 | 9 | 8 |
| v11.1.1 | `94eeb72` | 1,799 | 68 | 1 | 1 | 8 | 9 | 8 |
| v11.2.0 | `2bfc8a6` | 1,862 | 71 | 1 | 3 | 8 | 9 | 8 |
| v11.3.0 | `2a2da8a` | 1,914 | 75 | 1 | 2 | 8 | 9 | 8 |

The profile is written for v11.3.0. Before v10.0.0 there is no `guides/CHARTER.md`, so its claims cite a source that holds nothing (`citation-unverified`). The charter arrives at v10.0.0 with 57 requirements, and stale prose jumps with it. At v11.0.0 the guides grow from 15 documents to 27 and the scenarios by half, and stale prose doubles. From then on it only grows: lines are written once, and the code they name goes on changing.

A `dangling-reference` to a deleted file, such as DOC-01's `guides/MUTATION-TESTING.md`, is still not told apart from a mention of a file that never existed; history could, and stage 25 does not yet.

## The eleven rows

Each of the eleven disagreements listed in [11](../../docs/spec/11-ingesting-a-codebase.md) is reported or listed as unknown with a reason:

| Row | Reported as | Unknown, with the reason |
| --- | --- | --- |
| 1 | 2 `claim-conflict`, 2 `fact-conflict` | |
| 2 | `dangling-reference` at `guides/CHARTER.md:201` | |
| 3 | `fact-conflict`, `claim-conflict` | |
| 4 | `fact-conflict` | |
| 5 | `stale-prose` at `guides/CHARTER.md:896` | |
| 6 | `fact-conflict`, `stale-prose` | |
| 7 | `fact-conflict` for the unit tier; GATE-01's job count indeterminate | The CI job count: no adapter reads workflow files. The exclusion Rule count: no fact counts Rules by form |
| 8 | `fact-conflict` | |
| 9 | `unverified` ARCH-03, and its layering rule `satisfied` | `status-unsupported`: ARCH-03's stated status is Practised |
| 10 | 3 `justified-gap`, converged | |
| 11 | `claim-conflict`, `fact-conflict` | |
