# Stage 4: Lifting

**Exit:** F24, F50, F52; adapter determinism test.

**Status:** exit reached. All 51 fixtures pass at the end of the build.

## Built

- `witness`: the csh-witness/v1 format, its validation, the witness digest without `recordedAt`, and the `recordWitness` helper.
- `adapter-witness-files`: records become witnesses, and passing records also become example claims through reversed bindings ([ADR-13](../adr/ADR-13-passing-test-is-claim-and-witness.md)).
- `adapter-ears-markdown`: identified EARS sentences become citable items with a pattern and a text digest ([ADR-14](../adr/ADR-14-cite-not-translate.md)).
- Sources, claims and citations in `check`; isolated adapter runs ([ADR-20](../adr/ADR-20-adapter-isolation.md)).

## Effort

Small: about 420 lines across the three packages, plus the isolated runner. Effort was not timed. The build ran as one continuous session, so effort is given as code size and the number of correction rounds.

## What the fixtures revealed

- F24's witness carries a key (`overdraftLimitMinor`) that no binding maps. The record is unliftable with reason `unknown-term`, with its original line kept (P4).
- Claims from a formal model or a design note have no adapter in version 1. Claim sets already in IR form are read as data ([A-13](../../ASSUMPTIONS.md)).
- Adapter determinism holds regardless of file order (`packages/adapter-witness-files/test/adapter.test.ts`).

## What proved wrong or costly in the documents

None found wrong.
