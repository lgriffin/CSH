# Stage 6: Evidence

**Exit:** F30 to F35.

**Status:** exit reached. All 51 fixtures pass at the end of the build.

## Built

- Exact evaluation in `kernel`.
- Witness judging in `check`, in a fixed order: event, bindings, keys, policy rejection, freshness, evaluation.
- Assessments with verdict, scope, applicability and methods, and the evidence store with dependency digests.

## Effort

Medium: about 500 lines in `evidence.ts` and `assess.ts`. Effort was not timed. The build ran as one continuous session, so effort is given as code size and the number of correction rounds.

## What the fixtures revealed

- F30 reproduces the main tab's case: a passing test, a violated invariant, verdict violated in implementation scope.
- F31 (no binding) gives unknown with `binding-not-approved`, as the stage 6 exit requires.
- Three choices were needed where the documents are silent: an obligation with no policy is unknown ([A-02](../../ASSUMPTIONS.md)), a witness for another event is not evidence ([A-06](../../ASSUMPTIONS.md)), and applicability precedence ([A-08](../../ASSUMPTIONS.md)).

## What proved wrong or costly in the documents

None found wrong. The brief suggested a fake signature verifier for this stage; it was not needed, because authority was stood in at fragment level.
