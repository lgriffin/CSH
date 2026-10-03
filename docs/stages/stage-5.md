# Stage 5: Joint evaluation and gap view

**Exit:** F20 to F23; gap-view expectations for F12 and F24.

**Status:** exit reached. All 51 fixtures pass at the end of the build.

## Built

- The rest of `check`: comparability, cross-source findings, collision terms, the gap view with its derived gaps, the report and its text rendering.
- `csh check`, `csh gaps` and `csh explain`.

## Effort

The largest stage: `check` is about 1,400 lines. Effort was not timed. The build ran as one continuous session, so effort is given as code size and the number of correction rounds.

## What the fixtures revealed

- F21 produces two findings the document does not list: an example conflict under Q-EX and a not-met finding under Q-MEET. Both follow from the query definitions, and the fixture expects them ([Q-03](../../QUESTIONS.md)).
- F23 (two claims in different units) first came out unliftable instead of not comparable. A lifted claim that fails only on units is now not comparable with reason `unit-mismatch` (CSH-021, [A-30](../../ASSUMPTIONS.md)).
- The gap view needs a column for the module's own transitions. They sit in a pseudo-source `model` ([A-04](../../ASSUMPTIONS.md)).

## What proved wrong or costly in the documents

"Single-source" has no precise definition ([Q-11](../../QUESTIONS.md)).
