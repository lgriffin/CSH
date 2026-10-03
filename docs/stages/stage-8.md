# Stage 8: Composition

**Exit:** New fixtures F70 onward, flagged for owner review.

**Status:** exit reached. All 51 fixtures pass at the end of the build.

## Built

- Packs, `use()` with pinned versions and digests, the lock file and `csl lock`, vocabulary merging, conjunction of obligations, strengthening by refinement check, and explicit relaxation.
- Fixtures F70 to F78, written first from the main tab, section 6.3, each flagged `"ownerReview": true` ([Q-17](../../QUESTIONS.md)).

## Effort

Small to medium: changes to `csl` and `emit`, the refiner in `check`, and nine fixtures with one pack. Effort was not timed. The build ran as one continuous session, so effort is given as code size and the number of correction rounds.

## What the fixtures revealed

- F73 (USD against EUR) first failed with compiler errors instead of `E-VOCAB`, because its transition mixed units. The fixture's own profile was made consistent in USD, so that the only disagreement is with the pack.
- F77 specifies a thermostat with no kernel change, meeting the stage 8 exit's "second, unrelated domain".
- F75 shows a silent weakening refused with `E-WEAKEN`. F76 shows the same change accepted as an explicit, owned relaxation, which the report lists.

## What proved wrong or costly in the documents

The "recorded review" path for strengthening has no defined record ([Q-02](../../QUESTIONS.md)). Cycles of mutual assumptions cannot arise with version 1 packs ([Q-04](../../QUESTIONS.md)). Packs are not printed, so they are outside the printer round trip ([A-21](../../ASSUMPTIONS.md)).
