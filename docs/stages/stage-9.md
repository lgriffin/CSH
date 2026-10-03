# Stage 9: Gate

**Exit:** F44, F45.

**Status:** exit reached. All 51 fixtures pass at the end of the build.

## Built

- `gate`: snapshot digests, the disposition table, waivers with expiry, and the decision record.
- `csh gate`, `csh gate --verify`, advisory and enforcing modes, and the decision commands that draft ledger lines ([ADR-25](../adr/ADR-25-drafts-never-commit.md)).

## Effort

Small: about 140 lines in `gate`, plus the commands. Effort was not timed. The build ran as one continuous session, so effort is given as code size and the number of correction rounds.

## What the fixtures revealed

- F44: a waived violation still reports as violated, and the waiver stops applying once the snapshot commit is dated after its expiry. Expiry is compared with the commit date, not the wall clock, so the decision replays ([A-29](../../ASSUMPTIONS.md)).
- F45: a decision for one snapshot is refused for another. `csh gate` also refuses a report made for a different snapshot.

## What proved wrong or costly in the documents

None found wrong.
