# Stage 65: Coverage floors

**Exit:** `pnpm test:coverage` measures line, statement, function and branch coverage of every package's sources and
fails when the workspace or any package falls below its floor in `coverage-floors.json`. CI runs it in the job
`Coverage`. The packages that were least covered in process, `agent` and `review`, have tests that call them in
process. The README's counts and lists match the repository.

**Status:** exit reached. No result of any check changes, so there are no fixtures and `BUILT_THROUGH_STAGE` is
unchanged.

## Built

- `vitest.config.ts`: V8 coverage over `packages/*/src/**/*.ts`, with the thresholds read from
  `coverage-floors.json`, one entry for the workspace and one per package. Five files run only as a child process,
  which the coverage of the test workers cannot see, and are left out: the emission sandbox's runner, the adapter
  sandbox's runner, the bin scripts' process wrapper (tested by spawning it, stage 64) and two CI scripts of the test
  kit. The report goes to `coverage/`, also when a test fails.
- `package.json`: `pnpm test:coverage`. `@vitest/coverage-v8` 3.2.7, the version of vitest, is a development
  dependency ([DEPENDENCIES.md](../../DEPENDENCIES.md)).
- CI: the job `Coverage` runs the suite with coverage on Node 22, adds the workspace's totals to the job summary and
  keeps the report as an artifact.
- Tests:
  - `packages/agent/test/tools.test.ts` calls every tool of the agent server in process on a copy of the lockout
    example, with each refusal. The scripted session in the test kit drives the same tools through the server as a
    separate process, which coverage does not see.
  - `packages/cli/test/diff.test.ts` runs `csh diff` between two commits, a stored run and a commit, a commit and the
    working tree, and with a head that cannot be run.
- Docs: the README counts twenty-seven packages (`facts-code` was missing) and fourteen runtime containers (it said
  eleven), lists every guide, and says which questions the owner decided on 3 October and how the later ones are
  recorded. The stage index lists stages 55 to 65.

## The floors

Each floor is the measured coverage, rounded down, less one point, so that an unrelated change does not fail the job
on a fraction. A floor only rises: a change that lifts a package raises its floor in the same commit.

| | Lines | Functions | Branches |
| --- | --- | --- | --- |
| Before the stage (whole suite, nothing left out) | 90.1% | 93.4% | 86.1% |
| After the stage | 92.6% | 94.8% | 86.2% |
| `agent` | 51.7% to 87.0% | 38.1% to 85.7% | 56.7% to 71.2% |
| `review` | 78.6% to 97.3% | 77.8% to 100% | 74.3% to 79.5% |
| `cli` | 79.9% to 82.7% | 93.8% to 98.4% | 74.2% to 75.0% |
| `emit` (its sandbox runner left out) | 55.1% to 91.5% | 90.9% to 90.0% | 78.2% to 77.9% |

The least covered packages now are `csl` (76.9% of lines, 64.6% of functions: the builders a specification can call
but no fixture does), `adapter-c4-mermaid` (81.7% of lines) and `facts` (59.5% of branches). Their floors hold them
where they are; raising them is test work for a later stage.
