# tutors-release-harness, a subject profile

This directory evaluates [tutors-release-harness](https://github.com/tutors-sdk/tutors-release-harness) from outside, as a diagnostic of CSH itself. The profile is pinned to `main` at `195e0d1` (v1.35.0). The subject is only read; nothing is written to it. Only identifiers, paths and counts from it are committed here, never its text.

```
node packages/cli/bin/csh.js subject fetch --root subjects/tutors-release-harness
node packages/cli/bin/csh.js run --root subjects/tutors-release-harness
node packages/cli/bin/csh.js overview --root subjects/tutors-release-harness
node packages/cli/bin/csh.js expect --root subjects/tutors-release-harness
node packages/cli/bin/csh.js history releases --from v1.30.0 --to v1.35.0 --root subjects/tutors-release-harness
```

The test results are committed as [`csh/results.json`](csh/results.json): each test file's path and counts, and the mutant identifiers each citing test cites, at the pinned commit, with no test name. To make it again, run the suite in a git clone of the checkout, outside this repository, and reduce the report:

```
git clone .csh-cache/subjects/<commit> /tmp/trh && cd /tmp/trh && npm install --ignore-scripts
npx vitest run --reporter=json --outputFile=<this directory>/results/vitest.json
node packages/cli/bin/csh.js results import tdd subjects/tutors-release-harness/results/vitest.json --base /tmp/trh --root subjects/tutors-release-harness
```

The suite needs no service or network: every Docker, cosign and syft call is behind an injected function. The clone, the runner's report and the run reports stay under `.csh-cache/`, `results/` and `reports/`, which git ignores, as does the A3 under `csh/a3/releases/`.

## What it reads

| Stage | Practice | Source | Result at `195e0d1` |
| --- | --- | --- | --- |
| 22 | Docs | `README.md`, `TESTING.md`, `docs/**`, `kaizen/**`, `claims/README.md`, `deploy/**`, `mutants/README.md` | Markdown documents; 22 `dangling-reference` and 33 `stale-prose` gaps |
| 22 | Tests | `tests/**/*.test.ts` | 107 test files. The subject has no requirement identifiers, so `citePattern` is the sixteen mutant names, longest first |
| 22 | Mutants | `mutants/mutants.yaml`, through the trace adapter | 16 planted mutants |
| 22 | Scoreboard | `scoreboard/releases.jsonl` | empty; no item |
| 23 | Code facts | `src`, `bin`, `package.json`, `docs/contract/*.json` | read through `facts-ts` with nothing installed. `mutants/mutants.yaml` is listed too and ignored: facts-ts reads JSON and source files only |
| 23 | Layering | [`csh/spec.csl.ts`](csh/spec.csl.ts), five rules over modules, each citing a doc | 4 `satisfied`: `MannWhitneyIsDependencyFree` (`docs/architecture/06-decisions.md`), `ClockProbeIsPure` (`docs/architecture/README.md`), `CompareAndGateStayPure` (`docs/noise-burndown.md`), `NothingImportsTheCli` (`docs/architecture/02-containers.md`). 1 `violated`: `NormaliseAndClaimsStayPure` (`docs/user-guide/09-extending.md`), since `src/claims/schema.ts:11` and `src/normalise/masks.ts:5` import `src/stack.ts` |
| 24 | Claims | [`csh/spec.csl.ts`](csh/spec.csl.ts), the intent `DocsAboutCode`: 15 claims | 8 hold (`field`, `exportsName`, `script`, `fileExists`, one `holds: false`); 2 refuted by `package.json` and `cli.json` (docs drawn at 1.4.1 and 1.4.0: `fact-conflict` and `stale-prose`); 4 `claim-conflict`; the mutant counts stay undecided (below) |
| 26 | Test results | `csh/results.json`, from vitest 5 run in a scratch clone | 1,646 tests in 107 files; 1,641 passed, 5 failed in 3 files (`release-command`, `soak`, `why`), each comparing a Windows path with a POSIX one. 4 mutants (`added-package`, `base-swap`, `focus-order`, `unsigned-build`) are named in test titles that pass: `tested`, converged. The other 12 stay `unverified`: `mutant-build.test.ts` lists all 16 in one array inside a test body, and the test adapter cites only titles |
| 27 | Overview | `csh overview` | 95 results: 79 gaps, 0 indeterminate, 16 converged |
| 25 | Releases | `csh history releases --from v1.30.0 --to v1.35.0` | 6 stages, kept under `csh/a3/releases/`, which git ignores (the A3 has no judgments) |
| 28 | Expected | [`csh/expected.json`](csh/expected.json) | 8 rows; `csh expect` meets every expectation |

The mutant count is the profile's one open question. The docs say sixteen (`README.md`, `mutants/README.md`, `docs/architecture/README.md`, `docs/local.md`, the user guide's chapter 2) and thirteen (`docs/architecture/06-decisions.md:23`, the user guide's chapter 5, `docs/user-guide/09-extending.md`). `mutants.yaml` holds sixteen, and the Mutants practice reads 16 items. The three claims about it cannot be judged against the file, since no fact counts YAML entries, but the sixteen claim and each thirteen claim conflict whatever the file says: 2 `claim-conflict` findings.

| Release | Items | `dangling-reference` | `unverified` | `stale-prose` | `untraced-change` | `failing-test` | `fact-conflict` | `claim-conflict` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1.30.0 | 197 | 21 | 12 | 36 | 1 | 0 | 4 | 4 |
| v1.31.0 | 199 | 21 | 12 | 36 | 0 | 0 | 4 | 4 |
| v1.32.0 | 202 | 21 | 12 | 37 | 0 | 0 | 4 | 4 |
| v1.33.0 | 204 | 21 | 12 | 37 | 0 | 0 | 4 | 4 |
| v1.34.0 | 206 | 22 | 12 | 37 | 0 | 0 | 4 | 4 |
| v1.35.0 | 208 | 22 | 12 | 35 | 0 | 3 | 2 | 4 |

The profile is written for v1.35.0, so before it the claims that package.json and `cli.json` are at 1.35.0 are refuted too (4 `fact-conflict`). Results are joined only at their own commit, so only v1.35.0 has `failing-test`. Stale prose rises from 36 to 37 and is 35 at v1.35.0.
