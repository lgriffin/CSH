# Stage 11: Harness

**Exit:** F82, F83, F84, F85, plus every earlier fixture and both walkthroughs.

**Status:** exit reached.

## Built

- `harness`: the probe, which records each call to the function under test as a version 2 witness with the test's identity and no outcome, and a reporter for Node's test runner that writes one csh-execution/v1 line per finished test.
- `witness`: format csh-witness/v2 (optional `localResult`, optional `cites`), the execution line and its parser, `outcomeOf`. `recordWitness` no longer defaults to `passed`. Version 1 records are read unchanged.
- `adapter-witness-files`: joins each record with no outcome to its test's execution line, carries citations onto the lifted example in the source the practice names, and returns the execution lines it read.
- `run`: hands each witness source the execution file its practice's harness names (or `reports/executions.ndjson`), and the practice's `cites` setting.
- `check`: the gaps `outcome-unknown` and `unobserved-test`; the report's executions say `unknown` for a record with no outcome.

## The three corners

- C4: the "Harnesses" container, [components-harness.mmd](../architecture/components-harness.mmd), and the [run sequence](../architecture/run-sequence.mmd), which stage 10 owed.
- Docs: the harness README, [the probe guide](../guides/probe.md), and [the manifest reference](../guides/manifest.md), which stage 10 also owed; the witness and witness adapter READMEs; both walkthrough documents.
- Examples: the account and lockout tests run on the probe. The lockout harness command names the reporter, and the countermeasures stage's tests cite the sentences they serve (countermeasure C8). Every count in the lockout walkthrough is unchanged; only witness names moved on the A3, from ids chosen by hand to names taken from the tests.

## Effort

Medium: about 150 lines in `harness`, 60 in `witness`, 50 in the adapter, 25 in `check`. No correction rounds in the code. One type adjustment: the probe's `post` and `result` mappers receive the awaited result, so an async function under test is mapped like a synchronous one.

## What the fixtures revealed

- F82 and F83: joining by identity needs the identity on both sides in exactly the same form, so the probe and the reporter share one function for it ([A-39](../../ASSUMPTIONS.md)).
- F84: an unobserved test is only visible with the execution file, so the adapter returns the lines it read for the check engine to count ([A-41](../../ASSUMPTIONS.md)).
- F85: a citation on a lifted example uses the existing citation check, so `dangling-citation` and `uncited` needed no new code.

## What proved wrong or costly in the documents

- Moving the account example to the probe changed its witness names and so its finding ids; [the account walkthrough](../walkthrough.md) was regenerated.
- The design's probe sketch passes `post` the raw return value; for an async function that is a promise, so the probe awaits it ([A-42](../../ASSUMPTIONS.md)).
