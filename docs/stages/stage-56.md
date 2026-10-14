# Stage 56: The danger view

**Exit:** F161 to F164. Refuted and masked danger is a view across the three outcomes, reported first and never scored;
the lockout regression reads as masked ([16](../spec/16-analyse-danger-grain.md), section 3).

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 56. The lockout and account walkthroughs were re-recorded with a
`csh overview` step, and the lockout walkthrough fails unless the regression reads as masked, green over refuted, on
`LockOnThirdFailure`.

## Built

- `check` (`danger`): `dangerJudge` marks an overview entry refuted (`code-breaks-rule`, `code-refutes-prose`) or
  masked (`green-over-refuted`, `test-under-no-rule`, `rung-overclaimed`, `silence-beside-rule`, `self-approved`),
  with the obligation or item it is about, what reads green, and the one input that would close it
  ([A-193](../../ASSUMPTIONS.md)).
- `check` (`overview`, `analysis`): `danger` on each marked entry and counts by structure; `csh overview` prints a Danger
  section first, and the analysis reports a marked entry only there ([A-194](../../ASSUMPTIONS.md)).
- `check` (`check`) and `witness`: each execution names the example lifted from its witness, so a conflict that names
  that example names the test that observed it ([A-195](../../ASSUMPTIONS.md)).
- `adapter-ears-markdown` (`claimOf`) and `adapter-items`: a lifted told rule whose sentence claims that something
  checks it carries `claims` ([A-192](../../ASSUMPTIONS.md)).
- `a3`: a Danger tile per stage, a Danger column in the stage table, and the marked entries listed beneath it.
- `testkit`: the expectations `overview` (for a single run) and `danger`, `dangerAbsent` and `dangerCount` (for a run or
  an analysis); the stand-in authority's `selfApproved` list.
- [Q-54](../../QUESTIONS.md) records the one choice the fixtures could not settle: self-approval is masked whatever the
  maintainers file says.

## What the fixtures and the walkthroughs revealed

- F163's first run left both obligations unknown: its policy asked for a solver check of a specification with no
  transitions. The policy was corrected with no expectation changed.
- F161 and F164 each have a passing test that observes behaviour their specification states no rule for. Their blind
  expectations missed it; spec 16 lists a passing test under no rule as masked, so both expectations were corrected to
  the spec in a commit of their own.
- F161 at first marked two entries: the violation's `single-source` gap named the same rule. Only the signal that
  reports a violation (the violation, or the finding that names it) carries its danger now.
- The lockout walkthrough reads as masked before the countermeasures too: three passing tests observe the code
  contradicting a rule or a scenario, which is the problem its A3 states. With one maintainer, each approved rule that
  converges is masked as self-approved (Q-54).
- ESI.ts's prose-drift A3, rebuilt over its twelve releases, now lists its danger at the last release: the claims the
  code facts refute and the dangling references are refuted, and a requirement whose stated status is Enforced with
  nothing behind it is masked. CSH's own layering A3 reads one refuted rule, `DiagramIsComplete`.
- The account walkthrough's premium-overdraw test passes and contradicts two rules and a third statement: three masked
  entries, while every rule is a candidate and the gate allows.

## Not done

- Citation without observation is stage 57 (grain); stale evidence and a masked case per taskboard receiver are stage
  59, where results from each ecosystem are joined (Q-53).
- Waived, and an agent's key on an approval line, are not marked: a waiver is not visible to the overview, and the
  ledger already refuses an approval signed by an agent's key.
