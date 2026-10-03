# A3: three practices, one lockout

This is a Lean A3 for the [lockout example](../examples/lockout): the whole problem on one sheet, read the way the
tutors-release-harness A3 is read. Background, current condition, goal, root cause analysis, countermeasures, plan and
follow-up. Every number comes from the two `csh check` runs in [the walkthrough](lockout-walkthrough.md). The same
sheet, laid out as an A3, is [lockout-a3.html](lockout-a3.html).

**Problem.** EARS, BDD and TDD are each designed to pin behaviour down and bring people onto one understanding. On
sign-in lockout all three report green, yet read together they disagree on 9 decision points, and the code ships one
of the readings nobody agreed.

| Each practice alone | Read together by CSH | Decision points in dispute | After the countermeasures |
| --- | --- | --- | --- |
| Green: 4 of 4 unit tests pass, 5 scenarios agreed, 5 sentences reviewed | 15 signals: 4 conflicts, 1 not comparable, 2 errors and warnings, 8 gaps | 9: 2 contradictions, 3 drifts between notations, 4 silences | 0 conflicts, drift or errors; 7 gaps kept by decision; verdicts still unknown |

The gate says `allow (advisory)` throughout, because nothing is approved. This sheet is advisory too. The harness
offers three readings for every conflict and chooses none; where this A3 picks a side, it says so.

## 1. Background

A sign-in service must stop password guessing without locking out the real account holder. Three practices describe
that behaviour, and each promises alignment. EARS promises one unambiguous way to write a requirement. BDD promises
one shared example that business and engineering agree on. TDD promises that design and verification move together.
Each unifies inside its own boundary. None of them is judged against the others.

|  | EARS | BDD | TDD |
| --- | --- | --- | --- |
| Author | Product owner | Three amigos | Developer, test first |
| Unit of truth | A rule over all cases, in prose | One agreed case | One execution and its assertion |
| Judged by | Review | Step definitions run against the code | The code it drove into being |
| In CSH | Cited, never translated; a person writes the predicate ([ADR-14](adr/ADR-14-cite-not-translate.md)) | An example, lifted through step definitions and bindings | An example and a witness ([ADR-13](adr/ADR-13-passing-test-is-claim-and-witness.md)) |
| Cannot say | A concrete value, or how two sentences combine | A rule; and a step means nothing until defined | Which requirement it serves |

## 2. Current condition

**How intent travels.** One user story is translated three times, in parallel. The product owner writes EARS
sentences and a person writes predicates that cite them. The three amigos agree Gherkin scenarios and step
definitions map their phrases to keys. The developer writes tests, then code, and the tests' keys are bound to model
terms. The three lanes share nothing between the story and the code. CSH is the first place they meet; without it,
the only place they meet is the running system.

Where the 15 signals were injected: EARS sentences 4, EARS predicates 1, BDD scenarios 2, BDD step definitions 1,
unit tests 2, and 5 that appear only where the lanes meet (the two conflicts with `LCK-003` and the three
`single-source` gaps).

**What each practice says at each decision point.**

| Decision point | EARS | BDD | TDD | CSH reports | Class |
| --- | --- | --- | --- | --- | --- |
| Third wrong password (2 before it) | LCK-001: lock | locked | refused, not locked | example-conflict, TDD against `LockOnThirdFailure`. BDD and TDD contradict each other on the same input, visible only through the rule | contradiction |
| Correct password on a locked account | LCK-002: refuse; LCK-003: accept | refused | refused | joint-conflict between LCK-002 and LCK-003; BDD and TDD each conflict with LCK-003 | contradiction |
| How long the lock lasts | 15 minutes, written as 900 s | "15 minutes" | 900 s | not comparable, unit-mismatch | drift |
| LCK-002's WHILE clause | WHILE, translated as `and` | | | warning shape-mismatch | drift |
| Successful sign-in resets the count | LCK-003 | says it, tagged `@LOCK-3` | resets | error dangling-citation | drift |
| Fourth wrong password | silent | silent | locks here | no-rule | silence |
| Email the holder on lock | LCK-004 | silent | silent | uncited | silence |
| Two-factor sign-in | LCK-005 (WHERE) | silent | silent | unliftable feature-scope, and uncited | silence |
| Support unlocks an account | silent | scenario | silent | unliftable unknown-step | silence |

**Pareto of the 15 signals by cause.**

| Cause | Signals | n | Cumulative |
| --- | --- | ---: | ---: |
| No practice owns the case | uncited ×2, unliftable ×2, no-rule | 5 | 33% |
| Rules come from one practice only | single-source ×3 | 3 | 53% |
| Sentences never checked together | joint-conflict and its two example-conflicts | 3 | 73% |
| Meaning drifts between notations | shape-mismatch, unit-mismatch, dangling-citation | 3 | 93% |
| A count in prose read two ways | the off-by-one example-conflict | 1 | 100% |

The first four are the vital few. Fifteen signals from one example show the shape of the problem, not a statistic.
Counted by frequency, silence leads. Counted by harm, the single off-by-one leads: it is the only signal that ships a
behaviour the owner did not ask for.

## 3. Goal

Every decision point has one rule that all three practices agree with, every translation between notations is visible
and reviewed, and every case one practice cannot express is a recorded decision.

| Measure | Before | Target | After | |
| --- | ---: | ---: | ---: | --- |
| Cross-source and joint conflicts | 4 | 0 | 0 | met |
| Not comparable | 1 | 0 | 0 | met |
| Shape mismatches and dangling citations | 2 | 0 | 0 | met |
| Examples with no rule | 1 | 0 | 0 | met |
| Silences without an owner decision | 4 | 0 | 3 | gap |
| Rules satisfied on approved evidence | 0 of 3 | 3 of 3 | 0 of 3 | gap |

## 4. Root cause analysis

1. **Why can all three be green while they disagree?** Each is judged by its own oracle. Tests pass against the code they drove, scenarios pass against their step definitions, and sentences pass review one at a time. No oracle reads another practice's artefact.
2. **Why do they disagree on the third attempt?** All three translated "three failed attempts" from the story independently, and an ordinal in prose reads two ways: the third one locks, or three are allowed. See `src/lockout.ts` (`failedAttempts > MAX_FAILED_ATTEMPTS`) and the 5 Whys below.
3. **Why does EARS contradict itself?** Each sentence was written and reviewed alone, and EARS has no rule for how two sentences combine. The WHILE clause that would separate them was left out of LCK-003. This is reading 2, a missing context, and only the owner can confirm it.
4. **Why does meaning drift between notations?** Every hand-off is a translation by a person or a table: WHILE became `and`, minutes became seconds, identifiers were renumbered. Bindings and step definitions are code that nobody reviews as requirements.
5. **Why are some cases nobody's?** Each practice can express things the others cannot. EARS can say WHERE and talk about email, BDD can describe a support workflow, and TDD can pin down the fourth attempt. What one practice says alone has nothing to agree or disagree with.
6. **Why would a BDD and TDD contradiction go unseen even with CSH?** Q-EX compares an example only with rules, never with another example (`packages/check/src/run.ts`). The scenario and the test on the third attempt collide only because LCK-001 has a predicate. Delete that rule and the contradiction is silent.

### The 5 Whys, for the off-by-one

1. **Why does the shipped code lock on the fourth failure?** It was written to pass `allows three failed attempts before locking`, the first test written.
2. **Why did the test allow three?** The developer read "three failed attempts" in the story as a limit (`MAX_FAILED_ATTEMPTS = 3` with `>`). The test came from the story, not from LCK-001 or the agreed scenario.
3. **Why from the story and not from the agreed artefacts?** A unit test has no way to cite a requirement or a scenario. The witness format carries no citation (Evidence tab, section 2), so nothing links the test to LCK-001.
4. **Why did the scenario, which agrees with LCK-001, not catch it?** The scenario and the test are both examples, and nothing compares examples with each other: not the BDD runner, not the test runner, and not Q-EX. The contradiction surfaces only because LCK-001 has a predicate.
5. **Why does it take a rule for two practices to meet?** The three practices share no artefact between the story and the code. Each translates the story on its own, so they are parallel lanes, not a chain.

Root cause, in a process: no shared hub. Countermeasures C1 (process) and C7 and C8 (harness).

## 5. Countermeasures

To the system, never to a person.

| # | Kind | Countermeasure | Answers | Status |
| --- | --- | --- | --- | --- |
| C1 | process | Make the EARS sentence the hub. A story is ready only when its sentences have identifiers, and every scenario and test names the one it illustrates. | 2, 5 | proposed |
| C2 | requirement | LCK-003 gains "WHILE the account is not locked" (reading 2). | 3 | applied |
| C3 | requirement | State counts as states, not ordinals: LCK-001 "fails when the account already has 2 failed attempts". | 2 | applied |
| C4 | test | Lock on the third failure in code and test; the fourth-attempt test becomes a locked-account test. | 2 | applied |
| C5 | binding | Record unit conversions in the source (`features/units.json`) where they are reviewed like bindings. | 4 | applied |
| C6 | binding | Translate WHILE with `while`; retag `@LOCK-3` as `@LCK-003`. | 4 | applied |
| C7 | harness | Add an example-to-example query: two examples from different sources whose inputs can coincide and whose outcomes cannot both hold. | 6 | proposed |
| C8 | harness | Let a witness cite a requirement, so a unit test carries the same link a scenario tag does. | 2, 6 | proposed |
| C9 | process | Run `csh check` on every change to requirements, features or tests, so a disagreement shows on the change that introduces it. | 1 | proposed |
| C10 | scope | The owner decides LCK-004, LCK-005 and the support unlock: model each one, or record it as out of scope. | 5 | owner decides |

C2 to C6 are applied in `examples/lockout/countermeasures/`, assuming the owner's answer to each conflict: the third
failure locks, and a locked account is refused even with the correct password. C7 and C8 change the harness and are
not built.

## 6. Plan

| What | Who | When |
| --- | --- | --- |
| Decide the two contradictions (C2, C3) | Security owner | Before any predicate is approved |
| Rewrite the sentences, fix code and test, retag (C2 to C6) | Product owner, developer, three amigos | In one change, after the decision |
| Approve the predicates and the five bindings | Security owner, signed | After the change is green in `csh check` |
| Hub rule and CI check (C1, C9) | Team lead | Next story |
| Example-to-example query and witness citations (C7, C8) | Harness maintainer | Next harness release |
| Scope decisions (C10) | Product owner | Before release |

## 7. Follow-up

| Check | Now | |
| --- | --- | --- |
| Second `csh check` has no findings | 0 findings, 0 not comparable, no errors | yes |
| Every test has a rule | no-rule gone | yes |
| Silences are decisions | LCK-004, LCK-005 and the support unlock still open | not yet |
| Rules rest on more than one practice | single-source ×3, by construction until C1 links tests and scenarios to rules | kept |
| Rules satisfied | verdict unknown: no approved binding, no model for a solver check | not yet |

Agreement between the practices is a precondition for a verdict, not a verdict. The last row turns green only after
signed approvals.
