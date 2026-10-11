# Stage 26: Test results

**Exit:** ESI.ts test outcomes are joined to the items their tests cite, and no verdict changes because of them.

**Status:** exit reached. ESI.ts's unit configuration ran beside the checkout at `2a2da8a`, and `csh run --root subjects/esi-ts` read its Jest report. It ran 8,805 tests, all passing but one skipped. 7,995 of them are joined to 230 of the profile's 261 test files, and through their names to 9 charter requirements. The run has the same 12 findings, the same verdicts and the same gaps as without results.

## Built

- `witness`: `parseTestResults` reads Jest's `--json` report, Vitest's `json` reporter (the same shape), and `csh-execution/v1` lines. `AdapterOutput.results` carries each test joined to its test file and the identifiers its full name cites, but never its name ([A-115](../../ASSUMPTIONS.md)).
- `adapter-items`: the test-file adapter reads the results file its practice names (`executions`). It matches each runner path to the one test file whose path ends it, and adds `passed`, `failed`, `errored` and `skipped` to each file's attributes. `no-results`, `results-unmatched` and `results-missing` report what could not be joined, by count.
- `check`: `testOutcomes` counts results per test file and per cited item in the report's `outcomes`. A test file with a failed or errored test is a `failing-test` gap that names what those tests cite. Nothing else reads the results ([A-116](../../ASSUMPTIONS.md)).
- `subjects/esi-ts`: the TDD practice names `results/jest.json`, which git ignores.

## What ESI.ts revealed

- **Coverage is thin.** Tests cite only 9 of the 66 charter requirements: ARCH-06, ARCH-07, DES-02, DOC-01, GATE-06 and SEC-09 to SEC-12, through 143 test results. The other 57 requirements are tested, if at all, by tests that do not say so. The run-time names cite exactly the requirements the static titles cite, so `it.each` and template titles hide no citation.
- **The unit configuration is not the whole suite.** 27 test files declare tests that the unit configuration does not run: contract, fault, fuzz and integration tests. Their outcomes stay unknown, which is the honest result: CSH says it cannot tell, not that they pass.
- **The BDD suites run under Jest too.** 810 results in 78 files come from `tests/bdd/**/*.steps.ts` and `*.spec.ts`. They are counted, but not joined to the scenarios they run.
- **Run outside git, two tests fail.** In a copy without `.git`, `charter-audit.test.ts` and `export-coverage.test.ts` fail, since they read git. CSH reported them as `failing-test` gaps and changed no verdict, which is the behaviour the exit asks for. The committed instructions run the tests in a clone.

## What proved wrong or costly in the documents

- The plan had a separate Jest and Vitest adapter writing `csh-execution/v1` lines. Joining a test to what it cites needs the source's identifier pattern and its test files, and the test-file adapter already has both. So the results are read there, and only counts leave it.
- `csh-execution/v1` lines would carry each test's name into the report, and ESI.ts's test names are its text. Counts carry none.

## What remains

- BDD results are not joined to Gherkin scenarios. Scenario titles are what jest-cucumber reports, so the Gherkin inventory adapter could join them as this one does.
- The results file records no commit. A file made at another commit of the subject would be read as if it were current. The runner's report has no field for it, and the profile does not yet record one.
- The stage 25 side-branch over-count (`rev-list A..HEAD` counts commits that are not descendants of the line's commit) is stage 27's.

## Effort

About 200 lines of source and 150 lines of tests. Running ESI.ts's unit tests takes about 4.5 minutes in this container. Effort was not timed.
