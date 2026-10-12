# Stage 49: The taskboard profiles

**Exit:** the paper's three receivers, `taskboard` in TypeScript, Java and Python, are profiles with expected results
written before the first run, and CI runs each ([14](../spec/14-assertion-ladder.md), section 7).

**Status:** exit reached. At commit `ce2767c` of AI-Reference-Projects, `csh expect` finds every expectation of all
three met, rungs included.

| Profile | Obligations | Converged | Gap | Indeterminate | L3 | L5 |
| --- | --- | --- | --- | --- | --- | --- |
| [taskboard-typescript](../../subjects/taskboard-typescript) | 8 | 8 | 0 | 0 | 9 | 1 (`R-ERR-1`) |
| [taskboard-java](../../subjects/taskboard-java) | 8 | 8 | 0 | 0 | 9 | 1 (`R-ERR-1`) |
| [taskboard-python](../../subjects/taskboard-python) | 8 | 7 | 0 | 1 (the `total` claim) | 10 | 0 |

## Built

- Three profiles, each with a `csh-component/v2` manifest (Requirements, Instructions, Tests, Code), seven layering
  rules from the "Where things go" table of the receiver's `AGENTS.md`, and the claim `Prevented/ErrorStatusIsTotal`
  citing `R-ERR-1`. A README per subject.
- CI: the three join the `polyglot` matrix as `Subject (taskboard-<language>)`.
- [A-169](../../ASSUMPTIONS.md).

## What the subjects revealed

- The first runs put `R-LIST-1` in Java at L2: the contract class `TaskRepositoryContract.java` that cites it was left
  out by a `*Test.java` include. The profile now reads `src/test/java/**/*.java`. The expectation was right; the
  profile's reading was wrong.
- A rule that cites `AGENTS.md` must name it as the item id, `java/AGENTS.md`, a path from the repository root; a
  path from the source's directory is a dangling citation.
- The receivers agree with the paper: every rule has a check, so every rule is at least L3, and only the compiled
  languages reach L5 for V6.
