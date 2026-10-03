# Stage 15: Anchor

**Exit:** `csh run` completes on the gate component, and `csh a3 open` produces a skeleton with every signal listed.
Every earlier fixture and both walkthroughs stay green.

**Status:** exit reached. The sheet is the owner's from here ([issue #13](https://github.com/lgriffin/CSH/issues/13)).

## Built

- The gate component, in `packages/gate`, all of it candidate:
  - [csh/component.json](../../packages/gate/csh/component.json): two practices, the requirements (`Authority`) and the unit tests (`UnitTests`), whose harness runs the probe under `node --test`.
  - [docs/requirements.md](../../packages/gate/docs/requirements.md): the seven rows of the Authority tab's disposition table (section 6) as EARS sentences GATE-001 to GATE-007.
  - [spec/gate.csl.ts](../../packages/gate/spec/gate.csl.ts): a state with no fields, one event `Decide` taking the verdict, applicability, mode and four yes-or-no facts and returning a disposition, the table as one transition, the seven rows as requirement predicates citing their sentences, and the bindings ([A-48](../../ASSUMPTIONS.md)).
  - `test/gate.probe.ts`: a probe around `gate`, mapping the one assessment of each call to the event's arguments and the obligation's disposition to its result, over the cases of `test/gate.test.ts` ([A-49](../../ASSUMPTIONS.md)).
- Its first run, at the commit that added it, recorded by `csh a3 open dispositions --root packages/gate` as the stage `first`, with the skeleton and the sheet built from it: [csh/a3/dispositions](../../packages/gate/csh/a3/dispositions/a3.md). Nothing is approved; no judged section is written; `gate.ts` is unchanged.
- `run`: a run at a past commit of a component in a subdirectory links that subdirectory's installed `node_modules` into the worktree ([A-50](../../ASSUMPTIONS.md)). Without it, `csh a3 verify` on the gate failed: the worktree could not resolve `@csh/kernel`.
- `a3`: the sheet's Tests column counts tests, not witnesses. A test that calls the probed function three times counted three times.
- `harness`: the probe's test context type accepts Node's own `TestContext` under `exactOptionalPropertyTypes`.
- `testkit`: `BUILT_THROUGH_STAGE` is 15. No fixture belongs to this stage.

## What the first run reported

The report, as `csh run --root packages/gate` printed it and the stage record holds it. What it means is for the
owner's judgments; this note does not interpret it (section 14.4, rule 5).

| Count | Value |
| --- | --- |
| Tests | 15 passed; 14 recorded witnesses (17 calls), 1 recorded none |
| Obligations | 7, all `conflicting`; none approved |
| Findings | 13: 11 `joint-conflict` between requirement predicates, 2 `example-conflict` between a unit-test witness and `AllowSatisfied`; 2 cross-source |
| Gaps | 8: 7 `single-source`, one per predicate; 1 `unobserved-test` |
| Divergences, not comparable, errors | 0, 0, 0 |
| Gate | allow, advisory |
| Signals on the sheet | 21, all unclassified |

`csh a3 verify dispositions --root packages/gate` re-runs the commit and gets the same snapshot, report and gate decision.

## The three corners

- C4: no new container. The gate container is now exercised by a component of its own as well as by every run.
- Docs: the gate, run and A3 package READMEs, the A3 guide, [A-48 to A-50](../../ASSUMPTIONS.md), [Q-20](../../QUESTIONS.md), and the divergence query's measured cost in [DEPENDENCIES.md](../../DEPENDENCIES.md), which stage 13 owed.
- Examples: the gate component is the second example of the A3, an opened one; `packages/cli/test/a3.test.ts` checks its committed sheet against its stage record.

## What moved on the lockout sheet

Nothing. The Tests column now counts tests, and every lockout test calls the probe once, so its counts are unchanged.

## Effort

Medium: about 230 lines of component (sentences, model, probe), 10 in `run`, 5 in `a3`, and tests. Correction rounds:
`csh a3 verify` failed on the first try at a past commit of a workspace package, and the sheet's test count was
found to count witnesses.

## What proved wrong or costly in the documents

- Section 8 asks for "one event, `Decide`, with a transition per row". The check engine reads every transition of an event as the whole behaviour, so seven guarded transitions would each fail every other row's requirement. The rows are seven implications in one transition ([A-48](../../ASSUMPTIONS.md)).
- Section 8 names "the unit tests" as the test practice with a probe around `gate`. The repository's tests run under vitest, and the harness reports outcomes for Node's test runner only, so the probe is a second file ([Q-20](../../QUESTIONS.md), [issue #12](https://github.com/lgriffin/CSH/issues/12)).
- Section 4.2's run at a past commit assumed a project whose packages resolve from the repository root; a workspace package resolves from its own directory too ([A-50](../../ASSUMPTIONS.md)).
- The divergence query's cost (14.1, last point): about 8 ms a query, growing with the square of the examples per event, every query far inside the budget ([DEPENDENCIES.md](../../DEPENDENCIES.md)).
