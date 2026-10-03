# Stage 1: Semantic contract

**Exit:** None of its own. Its exit is that every fixture has a README and an `expected.json` naming its document section.

**Status:** exit reached. All 51 fixtures pass at the end of the build.

## Built

- Repository skeleton: a pnpm workspace of thirteen packages, strict TypeScript, Vitest, and the MIT licence.
- `kernel` model types for csh-ir/v1 (`packages/kernel/src/model.ts`).
- Every fixture directory from F01 to F64, written from the documents before any code: a README, a specification (most generated from `fixtures/base/account.csl.ts`), inputs and `expected.json`.
- `testkit`: the fixture loader and the matcher. The matcher checks counterexamples and no-outcome inputs independently instead of comparing solver models ([ADR-26](../adr/ADR-26-fixture-runner.md)).

## Effort

Small. The fixtures were the larger part: 51 directories in all, F70 to F78 coming later in stage 8. Effort was not timed. The build ran as one continuous session, so effort is given as code size and the number of correction rounds.

## What the fixtures revealed

- Expected results could be written for every fixture from the documents alone, except where noted under the later stages.
- Two places needed a shared base beyond the account specification of the main tab, section 7.2. The evidence fixtures need every term bound and a witness source ([A-09](../../ASSUMPTIONS.md)). Fixtures before stage 7 need a stand-in for the ledger ([A-14](../../ASSUMPTIONS.md)).

## What proved wrong or costly in the documents

The documents define fixture inputs but not who authored each specification change, which F62 needs. The git fixtures therefore describe their history as steps (`inputs/scenario.json`), each signed by a named test-only identity.
