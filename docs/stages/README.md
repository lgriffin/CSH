# Stage notes

One note per stage (Architecture tab, section 6): what was built, the effort, what the fixtures revealed, and anything in the documents that proved wrong or costly. This is the Lean review the main tab requires.

- [Stage 1: Semantic contract](stage-1.md)
- [Stage 2: Language](stage-2.md)
- [Stage 3: Specification checks](stage-3.md)
- [Stage 4: Lifting](stage-4.md)
- [Stage 5: Joint evaluation and gap view](stage-5.md)
- [Stage 6: Evidence](stage-6.md)
- [Stage 7: Authority and invalidation](stage-7.md)
- [Stage 8: Composition](stage-8.md)
- [Stage 9: Gate](stage-9.md)
- [Stage 10: Component and run](stage-10.md)
- [Stage 11: Harness](stage-11.md)
- [Stage 12: Scenario adapter](stage-12.md)
- [Stage 13: Divergence](stage-13.md)
- [Stage 14: A3](stage-14.md)
- [Stage 15: Anchor](stage-15.md)
- [Stage 16: Start point](stage-16.md)
- [Stage 17: Authority](stage-17.md)
- [Stage 18: Checked C4](stage-18.md)
- [Stage 19: Change review](stage-19.md)
- [Stage 20: Agent interface](stage-20.md)
- [Stage 21: Subject profiles and runs without a model](stage-21.md)
- [Stage 22: Items and edges](stage-22.md)
- [Stage 23: Code facts](stage-23.md)
- [Stage 24: Structural claims](stage-24.md)
- [Stage 25: History](stage-25.md)
- [Stage 26: Test results](stage-26.md)
- [Stage 27: Scale and the overview](stage-27.md)
- [Stage 28: The ESI.ts profile and its A3](stage-28.md)
- [Stage 29: Language seams](stage-29.md)
- [Stage 30: Results from JUnit XML and go test -json](stage-30.md)
- [Stage 31: A Python reader](stage-31.md)
- [Stage 32: A Java reader](stage-32.md)
- [Stage 33: A Go reader](stage-33.md)
- [Stage 34: A Rust reader](stage-34.md)
- [Stage 35: Test inventory for pytest, JUnit, Go and Rust](stage-35.md)
- [Stage 36: Polyglot profiles](stage-36.md)
- [Stage 38: A proposed profile and coverage in every run](stage-38.md)
- [Stage 39: Rules that can be stated](stage-39.md)
- [Stage 40: Warm runs and history clones](stage-40.md)
- [Stage 41: Windows and line endings](stage-41.md)
- [Stage 42: Traceability past the file](stage-42.md)
- [Stage 43: Clearer output](stage-43.md)
- [Stage 44: Process and safety](stage-44.md)
- [Stage 45: From the Java and Python runs](stage-45.md)
- [Stage 46: The second round of real runs](stage-46.md)
- [Stage 47: The Assertion Ladder, by name](stage-47.md)
- [Stage 48: Rungs](stage-48.md)
- [Stage 49: Prevention](stage-49.md)
- [Stage 50: Told](stage-50.md)
- [Stage 51: The taskboard profiles](stage-51.md)
- [Stage 52: Diagrams and the deck](stage-52.md)
- [Stage 53: The third round of real runs](stage-53.md)
- [Stage 54: The fourth round of real runs](stage-54.md)
- [Stage 55: The analyse command](stage-55.md)
- [Stage 56: The danger view](stage-56.md)
- [Stage 57: Grain](stage-57.md)
- [Stage 58: Polyglot containers](stage-58.md)
- [Stage 59: Evidence per ecosystem](stage-59.md)
- [Stage 60: Calibrate and ship](stage-60.md)
- [Stage 61: What the tutors-mono-repo run asked for](stage-61.md)
- [Stage 62: What the Toads run asked for](stage-62.md)
- [Stage 63: What the TypeScript run asked for](stage-63.md)
- [Stage 64: The command line, hardened](stage-64.md)
- [Stage 65: Coverage floors](stage-65.md)
- [Stage 67: Names in a package's documents](stage-67.md)
- [Stage 68: Task runners](stage-68.md)

Stages 10 to 16 build the anchor design ([09](../spec/09-anchor-harness-a3.md)): a component to anchor on, harnesses,
runs and the A3. Their fixtures, F80 to F96, were written before any of their code, and the fixture runner reports
each one as pending until its stage is built (`BUILT_THROUGH_STAGE` in `packages/testkit/src/runner.ts`).


Stages 17 to 20 build the next layers ([10](../spec/10-next-layers.md)): authority made real, the C4 diagrams as a
checked source, change review and an agent interface. Their fixtures, F97 to F117, were written before any of their
code, and are reported as pending until their stage is built.

Stages 21 to 28 make CSH ingest a real git codebase ([11](../spec/11-ingesting-a-codebase.md)), with ESI.ts as the
subject throughout. Its profile is [subjects/esi-ts](../../subjects/esi-ts).

Stages 38 to 46, 53 and 54 answer what Leigh's runs over six TypeScript repositories asked for ([13](../spec/13-from-real-runs.md),
[issue 66](https://github.com/lgriffin/CSH/issues/66)). Their fixtures start at F130.

Stages 47 to 52 bring [the Assertion Ladder](https://github.com/lgriffin/AI-Reference-Projects/tree/master/paper) into
CSH as a second axis beside the outcome ([15](../spec/15-assertion-ladder.md)). Their fixtures start at F150.

Stages 55 to 60 add `csh analyse`, a cold read of any repository, with danger, grain, packages and evidence in every
language, then calibrate it on five subjects and ship it as a release and an Action
([16](../spec/16-analyse-danger-grain.md)). Their fixtures start at F160.

Stage 61 answers what a cold read of tutors-mono-repo asked for ([17](../spec/17-from-the-tutors-run.md),
[issue 85](https://github.com/lgriffin/CSH/issues/85)): rule tags, scenarios bound by title, the step library's dialect,
file mentions, dependency-cruiser checks, baselines and specification prose. Its fixtures are F179 to F183.

Stage 62 answers what a cold read of Toads, a Python repository, asked for ([18](../spec/18-from-the-toads-run.md),
[issue 87](https://github.com/lgriffin/CSH/issues/87)): ignored files, pytest-bdd's bindings and step definitions,
import-linter contracts, and what a told rule is not. Its fixtures are F184 to F188.

Stage 63 answers what a cold read of microsoft/TypeScript asked for ([19](../spec/19-from-the-typescript-run.md),
[issue 89](https://github.com/lgriffin/CSH/issues/89)): a file the reader is told to create, test titles in a repository
with no identifier scheme, and relative Markdown links. Its fixtures are F189 to F191.

Stage 64 hardens the command line for use outside this repository: every argument is checked before a command runs,
each mistake is named with the command's usage, files that cannot be used are said rather than thrown, and the README
and [the command line guide](../guides/cli.md) say how to use it. It changes no result, so it has no fixtures.

Stage 65 measures coverage for the first time and holds every package to a floor in CI, and brings the README's
counts and lists up to date.

Stages 67 and 68 answer the rest of what the TypeScript run asked for ([20](../spec/20-symbols-and-task-runners.md),
[issue 89](https://github.com/lgriffin/CSH/issues/89)): a name a package's own document gives in backticks, checked
against the package's code, and the commands of hereby, make and just. Their fixtures are F192 to F194.

Stages 70 to 73 read a repository's test suites as evidence ([21](../spec/21-test-suites-as-evidence.md),
[issue 89](https://github.com/lgriffin/CSH/issues/89), gap 6): cases paired with their accepted outputs, snapshot
entries with their tests, and what prose names with the tests that exercise it. Stage 70 pairs by path. Its fixtures
are F210 to F216. Stage 71 reads Jest and Vitest snapshot entries and the outputs named after a test file, TypeScript
first; stage 74 brings the other languages' snapshot entries. Its fixtures are F217 to F219. Stage 72 sets each
symbol a document names against what the code of the tests of its language mentions. Its fixtures are F223 to F225.

Stage 75 answers Leigh's question about what the TypeScript run read ([21](../spec/21-test-suites-as-evidence.md),
section 8): the coverage line counts the eligible files read, parsed and read by name, says why every other tracked
file was skipped, and a directory named `build` is passed over only where a build writes it. Its fixture is F226.
