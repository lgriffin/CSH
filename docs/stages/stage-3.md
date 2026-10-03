# Stage 3: Specification checks

**Exit:** F10 to F16.

**Status:** exit reached. All 51 fixtures pass at the end of the build.

## Built

- `solver`: the encoding of csh-predicate-v1 into Z3, the queries Q-STATE, Q-VAC, Q-FEAS, Q-EX, Q-PRES and Q-MEET, and core minimisation to minimal conflicting sets.
- The single-source part of `check`: the pool and the queries over the specification alone.

## Effort

About 850 lines in `solver`. Q-FEAS, the quantified query, took the most care. Effort was not timed. The build ran as one continuous session, so effort is given as code size and the number of correction rounds.

## What the fixtures revealed

- F13 (two contradictory invariants) showed that once a state is inconsistent, every downstream query on it is vacuously true or false. Those queries are skipped for that state ([A-07](../../ASSUMPTIONS.md), [Q-09](../../QUESTIONS.md)).
- F14 expects a finding's context to name the assumption that applies. The checker reports every assumption in force, so the matcher accepts a superset ([A-27](../../ASSUMPTIONS.md)).
- A fake solver that crashes, times out or answers garbage turns every affected obligation unknown. No fixture was needed to show it; the fault-injection test does.

## What proved wrong or costly in the documents

Which assumptions belong to "the shared context C" is not defined. They are scoped by state and event ([A-05](../../ASSUMPTIONS.md), [Q-06](../../QUESTIONS.md)).
