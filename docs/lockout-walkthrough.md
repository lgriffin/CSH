# Walkthrough: the lockout example

This is the harness run end to end on `examples/lockout`, with the real output of each command. It was produced by
`examples/lockout/walkthrough.sh` on 3 October 2026, with Node 22.22 and Z3 5.1. The script copies the example into a
scratch git repository, so commit hashes differ from run to run. Nothing in it is signed or approved.

The example is one behaviour, sign-in lockout, described by three practices. Each is meant to pin behaviour down, and
each is green on its own terms:

| Source | Practice | Who writes it | What it holds |
| --- | --- | --- | --- |
| `Product` | EARS | The product owner | Five requirement sentences, `LCK-001` to `LCK-005`, in `docs/requirements.md` |
| `Scenarios` | BDD | The three amigos | Five Gherkin scenarios in `features/lockout.feature`, tagged with the requirement each illustrates |
| `UnitTests` | TDD | The developer, test first | Four unit tests that record witnesses through `recordWitness` |

The intent block in `spec/lockout.csl.ts` holds three predicates a person wrote from the EARS sentences, each citing
the sentence it claims to express. There is deliberately no formal model of the transition: the three practices are the
only voices, so everything the harness reports is a disagreement between them. The Lean reading of the same output is
[the A3](lockout-a3.md).

Version 1 has no adapter for scenario files (Evidence tab, section 7), so the example brings its own:
`examples/lockout/adapters/gherkin.ts`, named for the source kind `Scenarios` in `csh/config.json`. It does what
Cucumber's step definitions do. A table maps each step phrase to the key it sets, and the key is lifted to a model term
through the same bindings the unit tests use. A scenario with a step the table does not know is kept as unliftable,
and a tag that looks like a requirement identifier becomes a citation.

To run it yourself, from the repository root:

```sh
pnpm install
examples/lockout/walkthrough.sh
```

In the commands below, `csh` and `csl` stand for `node packages/cli/bin/csh.js` and `node packages/cli/bin/csl.js`.

## 1. Emit the model

```text
$ csl emit spec/lockout.csl.ts
sha256:66743add5a384c68a39afc17e1465bde853b18de8195a77de10a23fa9484f20e
```

## 2. Run the tests, which record witnesses

```text
$ CSH_COMMIT=$(git rev-parse HEAD) CSH_WITNESS_FILE=reports/witnesses.ndjson node --test test/lockout.test.ts
✔ allows three failed attempts before locking
✔ locks on the fourth failed attempt
✔ refuses a locked account even with the correct password
✔ resets the count on a successful sign-in
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

All four tests pass. The second one, `locks on the fourth failed attempt`, is the developer's reading of "three failed
attempts": three are allowed, and the lock comes with the attempt after them (`src/lockout.ts`).

## 3. Check

```text
$ csh check
CSH report for sha256:66743add5a384c68a39afc17e1465bde853b18de8195a77de10a23fa9484f20e
tool 0.1.0, solver z3 5.1.0.0, budget 5000 ms, commit 9324dc654489412599cf3494265295381ed48774, ledger head 0

== Cross-source conflicts

[example-conflict] c897987617527744  (cross-source)  from Q-EX(SignInService/@Scenarios/ScenarioALockedAccountIsRefusedEvenWithTheCorrectPassword)
  - SignInService/@Scenarios/ScenarioALockedAccountIsRefusedEvenWithTheCorrectPassword  source Scenarios, candidate
  - SignInService/StopPasswordGuessing/AcceptCorrectPassword  source intent, candidate
  context: SignInService/StopPasswordGuessing/CountNeverNegative
  collision terms: SignIn.args.passwordOk, SignIn.result
  Three readings, and the harness chooses none:
    1. A member is wrong.
    2. A context is missing (an assumption that would separate the cases).
    3. The intent is undecided, and a person must decide it.

[example-conflict] 776bf7df8a4c2145  (cross-source)  from Q-EX(SignInService/@UnitTests/WitnessAllowsThreeFailures)
  - SignInService/@UnitTests/WitnessAllowsThreeFailures  source UnitTests, candidate
  - SignInService/StopPasswordGuessing/LockOnThirdFailure  source intent, candidate
  context: SignInService/StopPasswordGuessing/CountNeverNegative
  collision terms: Login.failures@pre, Login.lockSeconds@post, Login.locked@post, SignIn.args.passwordOk, SignIn.result
  Three readings, and the harness chooses none:
    1. A member is wrong.
    2. A context is missing (an assumption that would separate the cases).
    3. The intent is undecided, and a person must decide it.

[example-conflict] 3531cd9fa8be09b9  (cross-source)  from Q-EX(SignInService/@UnitTests/WitnessRefusesWhenLocked)
  - SignInService/@UnitTests/WitnessRefusesWhenLocked  source UnitTests, candidate
  - SignInService/StopPasswordGuessing/AcceptCorrectPassword  source intent, candidate
  context: SignInService/StopPasswordGuessing/CountNeverNegative
  collision terms: Login.failures@post, SignIn.args.passwordOk, SignIn.result
  Three readings, and the harness chooses none:
    1. A member is wrong.
    2. A context is missing (an assumption that would separate the cases).
    3. The intent is undecided, and a person must decide it.

== Other conflicts

[joint-conflict] 6aa446d724b76ed9  from Q-FEAS(SignIn)
  - SignInService/StopPasswordGuessing/AcceptCorrectPassword  source intent, candidate
  - SignInService/StopPasswordGuessing/RefuseWhileLocked  source intent, candidate
  context: SignInService/StopPasswordGuessing/CountNeverNegative
  collision terms: SignIn.result
  input with no valid outcome: Login.failures@pre = 0, Login.locked@pre = true, SignIn.args.passwordOk = true
  Three readings, and the harness chooses none:
    1. A member is wrong.
    2. A context is missing (an assumption that would separate the cases).
    3. The intent is undecided, and a person must decide it.

== Not comparable

  SignInService/@Scenarios/ScenarioTheLockLastsFifteenMinutes  (Scenarios): unit-mismatch

== Gap view

  subject                                                   intent      Product     Scenarios   UnitTests  
  Login.failures                                            asserts     silent      exemplifies exemplifies
  Login.lockSeconds                                         asserts     silent      silent      exemplifies
  Login.locked                                              asserts     silent      exemplifies exemplifies
  SignIn                                                    asserts     silent      exemplifies exemplifies
  SignIn.args.passwordOk                                    asserts     silent      exemplifies exemplifies
  SignIn.result                                             asserts     silent      exemplifies exemplifies
  SignInService/StopPasswordGuessing/AcceptCorrectPassword  asserts     silent      exemplifies exemplifies
  SignInService/StopPasswordGuessing/LockOnThirdFailure     asserts     silent      exemplifies exemplifies
  SignInService/StopPasswordGuessing/RefuseWhileLocked      asserts     silent      exemplifies exemplifies

  Derived gaps (a gap is not a failure):
  - unliftable  Product: Product docs/requirements.md:9: feature-scope
  - unliftable  Scenarios: Scenarios features/lockout.feature:35: unknown-step
  - no-rule  SignInService/@UnitTests/WitnessLocksOnFourth: no requirement on SignIn has a trigger this example meets
  - single-source  SignInService/StopPasswordGuessing/AcceptCorrectPassword: Login.failures, SignIn.args.passwordOk, SignIn.result asserted only by intent
  - single-source  SignInService/StopPasswordGuessing/LockOnThirdFailure: Login.failures, Login.lockSeconds, Login.locked, SignIn.args.passwordOk, SignIn.result asserted only by intent
  - single-source  SignInService/StopPasswordGuessing/RefuseWhileLocked: Login.locked, SignIn.result asserted only by intent
  - uncited  Product/LCK-004: docs/requirements.md:8: no fragment cites it
  - uncited  Product/LCK-005: docs/requirements.md:9: no fragment cites it

== Obligations

  conflicting (specification)  SignInService/StopPasswordGuessing/AcceptCorrectPassword  [candidate; evidence inapplicable]  joint-conflict: 6aa446d724b76ed9; example-conflict: c897987617527744; example-conflict: 3531cd9fa8be09b9; joint-conflict; example-conflict
  conflicting (specification)  SignInService/StopPasswordGuessing/LockOnThirdFailure  [candidate; evidence inapplicable]  example-conflict: 776bf7df8a4c2145; example-conflict
  conflicting (specification)  SignInService/StopPasswordGuessing/RefuseWhileLocked  [candidate; evidence inapplicable]  joint-conflict: 6aa446d724b76ed9; joint-conflict

== Errors and warnings

  warning shape-mismatch: Product/LCK-002 is complex with a while clause; SignInService/StopPasswordGuessing/RefuseWhileLocked has no while
  error dangling-citation: SignInService/@Scenarios/ScenarioASuccessfulSignInClearsTheFailedAttempts cites Product/LOCK-3, which does not exist

== Counts

  findings 4: state-conflict 0, joint-conflict 1, example-conflict 3, vacuous 0, not-preserved 0, not-met 0, unknown 0
  gaps 8; not comparable 1; unliftable 2
  obligations 3: conflicting 3, violated 0, satisfied 0, unknown 0
```

How to read this report, one practice pair at a time:

- **TDD against EARS.** `WitnessAllowsThreeFailures` is the unit test that lets a third wrong password through
  unlocked. `LockOnThirdFailure`, written from `LCK-001`, says the third one locks. Five collision terms: the two
  practices agree on the input and disagree on everything that follows. This is an off-by-one that would ship green.
- **EARS against EARS.** The joint conflict needs no evidence at all. `LCK-002` (refuse while locked) and `LCK-003`
  (accept the correct password) each hold alone. On a locked account with the correct password, no outcome satisfies
  both, and the solver prints exactly that input. Each sentence was right when it was written, but nobody wrote them
  together.
- **BDD and TDD against EARS.** The scenario `A locked account is refused even with the correct password` and the
  unit test `refuses-when-locked` both conflict with `AcceptCorrectPassword`. Both practices took the side of `LCK-002`
  without saying so. Their two conflicts are the joint conflict seen from below.
- **BDD against TDD.** No finding names them together. The scenario `Third failed attempt locks the account` and the
  unit test `allows-three-failures` start from the same state with the same input and assert opposite results. The
  harness sees that only through `LockOnThirdFailure`, because Q-EX compares an example with rules, never with another
  example. Where EARS is silent, two examples can contradict each other unseen.
- **Not comparable.** `The lock lasts fifteen minutes` states minutes, and the model counts seconds. The harness
  reports a unit mismatch and keeps the scenario out of every conflict, rather than guess that 15 means 900.
- **Errors and warnings.** `LCK-002` has a WHILE clause, and the predicate that cites it was written with `and`
  (`shape-mismatch`). A scenario tag still uses an old identifier, `@LOCK-3`, so its citation points at nothing
  (`dangling-citation`).
- **The gap view.**
  - `Product` is silent on every row. EARS sentences are cited, never translated ([ADR-14](adr/ADR-14-cite-not-translate.md)), so the product owner's voice reaches the model only through the person who wrote the predicates.
  - All three rules are `single-source`: BDD and TDD contribute examples and never a rule, so every rule rests on EARS alone.
  - `WitnessLocksOnFourth` has `no-rule`: the test pins down behaviour that no sentence and no scenario covers.
  - `LCK-004` (email the holder) is uncited, and `LCK-005` (WHERE two-factor sign-in is enabled) is unliftable with reason `feature-scope` as well as uncited. The scenario `Support unlocks a locked account` is unliftable with reason `unknown-step`.

`csh check` exited 0. Reporting and judging are separate powers ([ADR-11](adr/ADR-11-check-never-blocks.md)).

## 4. Explain the joint conflict

```text
$ csh explain 6aa446d724b76ed9
joint-conflict 6aa446d724b76ed9, from Q-FEAS(SignIn)

SignInService/StopPasswordGuessing/AcceptCorrectPassword  source intent, candidate, sha256:0be5870db1747cf409f4cc41e6421cc30327c794ccbb65260191e4843abc83fc
    i.requirement("AcceptCorrectPassword", {
      when: SignIn,
      and: ({ pre, args }) => args.passwordOk,
      shall: ({ pre, post, args, result }) => result.eq(Outcome.Accepted),
      ensures: ({ pre, post, args, result }) => [post.failures.eq(u_count_attempts(0))],
      cites: [{ source: Product, id: "LCK-003" }],
    });

SignInService/StopPasswordGuessing/RefuseWhileLocked  source intent, candidate, sha256:b47d9246a3101440a26073740002883afb4eaefefbd816216a80b78a21967f61
    i.requirement("RefuseWhileLocked", {
      when: SignIn,
      and: ({ pre, args }) => pre.locked,
      shall: ({ pre, post, args, result }) => result.eq(Outcome.Refused),
      cites: [{ source: Product, id: "LCK-002" }],
    });

Context: SignInService/StopPasswordGuessing/CountNeverNegative
Collision terms: SignIn.result
Input with no valid outcome: Login.failures@pre = 0, Login.locked@pre = true, SignIn.args.passwordOk = true

Three readings, and the harness chooses none:
  1. A member is wrong.
  2. A context is missing.
  3. The intent is undecided.
```

The input with no valid outcome is the whole argument: a locked account and the correct password. Reading 2, a missing
context, fits best here, because `LCK-003` never says whether it applies to a locked account. The harness still
chooses none.

## 5. Explain the off-by-one

```text
$ csh explain 776bf7df8a4c2145
example-conflict 776bf7df8a4c2145 (cross-source), from Q-EX(SignInService/@UnitTests/WitnessAllowsThreeFailures)

SignInService/@UnitTests/WitnessAllowsThreeFailures  source UnitTests, candidate, sha256:ec666614c78719e45f7470ddb1b6401ca63282738c327a21acb53fcbc674e5b7
    i.example("WitnessAllowsThreeFailures", {
      given: { failures: u_count_attempts(2), lockSeconds: u_time_s(0), locked: truth(false) },
      when: SignIn({ passwordOk: truth(false) }),
      then: ({ pre, post, args, result }) => and(result.eq(Outcome.Refused), post.failures.eq(u_count_attempts(3)), post.lockSeconds.eq(u_time_s(0)), post.locked.eq(truth(false))),
    });

SignInService/StopPasswordGuessing/LockOnThirdFailure  source intent, candidate, sha256:9b6a983c734e6116f2f488d0c49d5e117cb601e75c73e4e9d0ddb9704c02e4ce
    i.requirement("LockOnThirdFailure", {
      when: SignIn,
      and: ({ pre, args }) => args.passwordOk.not().and(pre.failures.eq(u_count_attempts(2))),
      shall: ({ pre, post, args, result }) => result.eq(Outcome.Refused).and(post.locked),
      ensures: ({ pre, post, args, result }) => [post.lockSeconds.eq(u_time_s(900))],
      cites: [{ source: Product, id: "LCK-001" }],
    });

Context: SignInService/StopPasswordGuessing/CountNeverNegative
Collision terms: Login.failures@pre, Login.lockSeconds@post, Login.locked@post, SignIn.args.passwordOk, SignIn.result

Three readings, and the harness chooses none:
  1. A member is wrong.
  2. A context is missing.
  3. The intent is undecided.
```

The lifted example shows the unit test exactly as the harness reads it. The collision terms name everything the test
asserts after the step. The developer and the product owner agree on the input and on the refusal, and disagree on
the lock.

## 6. Gate

```text
$ csh gate
gate allow (advisory)

  candidate, never blocking: SignInService/StopPasswordGuessing/AcceptCorrectPassword, SignInService/StopPasswordGuessing/LockOnThirdFailure, SignInService/StopPasswordGuessing/RefuseWhileLocked
```

Nothing is approved, so nothing can block ([ADR-28](adr/ADR-28-candidates-never-block.md)). Four green tests, five
agreed scenarios and five reviewed sentences carry no authority until a person approves the predicates and bindings.

## 7. After the countermeasures

The script then applies the countermeasures of [the A3](lockout-a3.md), section 5, as one commit. They take the
owner's side in each decision as an assumption, since only the owner can decide: the third failure locks, and a
locked account is refused even with the correct password.

```text
$ git show --stat --format= HEAD
 docs/requirements.md     |  4 ++--
 features/lockout.feature |  2 +-
 features/units.json      |  1 +
 spec/lockout.csl.ts      |  9 +++++----
 src/lockout.ts           |  4 ++--
 test/lockout.test.ts     | 20 ++++++++++----------
 6 files changed, 21 insertions(+), 19 deletions(-)
```

- `docs/requirements.md`: `LCK-001` counts explicitly ("fails when the account already has 2 failed attempts"), and `LCK-003` gains the context it was missing ("WHILE the account is not locked").
- `spec/lockout.csl.ts`: both predicates with a WHILE clause now use `while`.
- `src/lockout.ts` and `test/lockout.test.ts`: the lock comes with the third failure, and the fourth-attempt test becomes one about a locked account, which `RefuseWhileLocked` covers.
- `features/lockout.feature`: the tag `@LOCK-3` becomes `@LCK-003`.
- `features/units.json`: the team's decision that a minute is 60 seconds, recorded in the source where a reviewer sees it. The adapter applies it, so the fifteen-minute scenario becomes comparable.

```text
$ CSH_COMMIT=$(git rev-parse HEAD) CSH_WITNESS_FILE=reports/witnesses.ndjson node --test test/lockout.test.ts
✔ locks on the third failed attempt
✔ refuses a wrong password on a locked account without counting it
✔ refuses a locked account even with the correct password
✔ resets the count on a successful sign-in
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

```text
$ csh check
CSH report for sha256:7c78aa1c8d792b748d479498e6816d18ac14329a72fd1c2019ab646e0ea8f874
tool 0.1.0, solver z3 5.1.0.0, budget 5000 ms, commit 9488acf9db9c4c20e5c5fcd0bafde36727548f6b, ledger head 0

No findings.

== Gap view

  subject                                                   intent      Product     Scenarios   UnitTests  
  Login.failures                                            asserts     silent      exemplifies exemplifies
  Login.lockSeconds                                         asserts     silent      exemplifies exemplifies
  Login.locked                                              asserts     silent      exemplifies exemplifies
  SignIn                                                    asserts     silent      exemplifies exemplifies
  SignIn.args.passwordOk                                    asserts     silent      exemplifies exemplifies
  SignIn.result                                             asserts     silent      exemplifies exemplifies
  SignInService/StopPasswordGuessing/AcceptCorrectPassword  asserts     silent      exemplifies exemplifies
  SignInService/StopPasswordGuessing/LockOnThirdFailure     asserts     silent      exemplifies exemplifies
  SignInService/StopPasswordGuessing/RefuseWhileLocked      asserts     silent      exemplifies exemplifies

  Derived gaps (a gap is not a failure):
  - unliftable  Product: Product docs/requirements.md:9: feature-scope
  - unliftable  Scenarios: Scenarios features/lockout.feature:35: unknown-step
  - single-source  SignInService/StopPasswordGuessing/AcceptCorrectPassword: Login.failures, Login.locked, SignIn.args.passwordOk, SignIn.result asserted only by intent
  - single-source  SignInService/StopPasswordGuessing/LockOnThirdFailure: Login.failures, Login.lockSeconds, Login.locked, SignIn.args.passwordOk, SignIn.result asserted only by intent
  - single-source  SignInService/StopPasswordGuessing/RefuseWhileLocked: Login.locked, SignIn.result asserted only by intent
  - uncited  Product/LCK-004: docs/requirements.md:8: no fragment cites it
  - uncited  Product/LCK-005: docs/requirements.md:9: no fragment cites it

== Obligations

  unknown  SignInService/StopPasswordGuessing/AcceptCorrectPassword  [candidate; evidence inapplicable]  method-missing: ApprovedBinding; binding-not-approved: Login.failures, Login.locked, SignIn.args.passwordOk, SignIn.result; method-missing: BoundaryWitness; binding-not-approved: Login.locked; method-missing: SolverCheck; binding-not-approved
  unknown  SignInService/StopPasswordGuessing/LockOnThirdFailure  [candidate; evidence inapplicable]  method-missing: ApprovedBinding; binding-not-approved: Login.failures, Login.lockSeconds, Login.locked, SignIn.args.passwordOk, SignIn.result; method-missing: BoundaryWitness; binding-not-approved: Login.failures; method-missing: SolverCheck; binding-not-approved
  unknown  SignInService/StopPasswordGuessing/RefuseWhileLocked  [candidate; evidence inapplicable]  method-missing: ApprovedBinding; binding-not-approved: Login.locked, SignIn.result; method-missing: BoundaryWitness; binding-not-approved: Login.locked; method-missing: SolverCheck; binding-not-approved

== Counts

  findings 0: state-conflict 0, joint-conflict 0, example-conflict 0, vacuous 0, not-preserved 0, not-met 0, unknown 0
  gaps 7; not comparable 0; unliftable 2
  obligations 3: conflicting 0, violated 0, satisfied 0, unknown 3
```

No findings, no errors and nothing not comparable. What is left is what the A3 says should be left:

- The three `single-source` gaps remain. BDD and TDD can only give examples, so every rule rests on one practice by construction.
- `LCK-004`, `LCK-005` and the support scenario remain as gaps. They are owner decisions about scope, not defects, and a gap is not a failure.
- The verdict on each rule is `unknown`, not `satisfied`: no binding is approved and there is no model of the transition for a solver check. Agreement between the practices is a precondition for a verdict, not a verdict.
