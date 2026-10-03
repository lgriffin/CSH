# Walkthrough: the account example

This is the harness run end to end on `examples/account`, with the real output of each command. It was produced by
`examples/account/walkthrough.sh` on 3 October 2026, with Node 22.22 and Z3 5.1. The script copies the example into a
scratch git repository, so commit hashes differ from run to run. Nothing in it is signed or approved.

The example is the account service of the main tab, section 7.2. It has a specification written in CSL and three
sources from existing practice:

| Source | Kind | What it holds |
| --- | --- | --- |
| `UnitTests` | Witnesses | Three unit tests whose calls a probe records as witnesses |
| `Product` | Requirements | Two EARS sentences, `ACC-007` and `ACC-008`, in `docs/requirements.md` |
| `DesignNotes` | Claims as data | One design note that no vocabulary can express |

The implementation in `src/account.ts` lets premium accounts overdraw, following the design note. This is the worked
case of the main tab, section 6.6. The formal model says the balance never falls below the floor. A passing test
shows a withdrawal that leaves the balance at minus 5,000. A design note hints at why, in words the model cannot
express.

To run it yourself, from the repository root:

```sh
pnpm install
examples/account/walkthrough.sh
```

In the commands below, `csh` and `csl` stand for `node packages/cli/bin/csh.js` and `node packages/cli/bin/csl.js`.

## 1. Emit the model

```text
$ csl emit spec/account.csl.ts
sha256:c42a861da37cfd77953f8f400a186deae3ead0cea3de2b68e18cc9d5ef2ba32e
```

Emission runs the specification in a locked-down subprocess, twice, and prints the digest of the canonical model.
Approval will attach to fragment digests derived from this model, not to the source text ([ADR-07](adr/ADR-07-approval-follows-digest.md)).

## 2. Run the tests, which record witnesses

```text
$ CSH_COMMIT=$(git rev-parse HEAD) CSH_WITNESS_FILE=reports/witnesses.ndjson node --test --test-reporter=spec --test-reporter=@csh/harness/reporter test/account.test.ts
✔ rejects a withdrawal below the floor
✔ accepts a withdrawal within the balance
✔ lets a premium account overdraw
ℹ tests 3
ℹ pass 3
ℹ fail 0
```

All three tests pass. Passing is an execution fact (P2). The harness stores it and never treats it as conformance.
The probe in `test/account.test.ts` appended one witness record per call to `reports/witnesses.ndjson`, naming the
commit and the test but no outcome. The second reporter, `@csh/harness/reporter`, wrote one line per finished test to
`reports/executions.ndjson`, which `csh/config.json` names as its `executions` file, and the witness adapter joins the two by
test identity. Without that setting no executions file is joined, and every witness would stay unknown. A witness whose test has no
execution line has outcome unknown and is never lifted as a claim.

## 3. Check

```text
$ csh check
CSH report for sha256:c42a861da37cfd77953f8f400a186deae3ead0cea3de2b68e18cc9d5ef2ba32e
tool 0.1.0, solver z3 5.1.0.0, budget 5000 ms, commit a75bb1ff0e5080ec2696592cc9547956307450cc, ledger head 0

== Cross-source conflicts

[example-conflict] 0ad442418095eaee  (cross-source)  from Q-EX(AccountService/@UnitTests/WitnessLetsAPremiumAccountOverdraw)
  - AccountService/@UnitTests/WitnessLetsAPremiumAccountOverdraw  source UnitTests, candidate
  - AccountService/ProtectFunds/MinimumBalance  source intent, candidate
  context: AccountService/ProtectFunds/PositiveAmount
  collision terms: Account.balance@post, Account.floor@post
  Three readings, and the harness chooses none:
    1. A member is wrong.
    2. A context is missing (an assumption that would separate the cases).
    3. The intent is undecided, and a person must decide it.

[example-conflict] 2d00bb5c9d716a5c  (cross-source)  from Q-EX(AccountService/@UnitTests/WitnessLetsAPremiumAccountOverdraw)
  - AccountService/@UnitTests/WitnessLetsAPremiumAccountOverdraw  source UnitTests, candidate
  - AccountService/ProtectFunds/RejectInsufficientFunds  source intent, candidate
  context: AccountService/ProtectFunds/PositiveAmount
  collision terms: Account.balance@post, Account.balance@pre, Account.floor@pre, Withdraw.args.amount, Withdraw.result
  Three readings, and the harness chooses none:
    1. A member is wrong.
    2. A context is missing (an assumption that would separate the cases).
    3. The intent is undecided, and a person must decide it.

== Divergences between examples

[example-divergence] 95294d66ce4bd84b  (cross-source)  from Q-DIV(AccountService/@UnitTests/WitnessLetsAPremiumAccountOverdraw, AccountService/ProtectFunds/RejectAtBoundary)
  - AccountService/@UnitTests/WitnessLetsAPremiumAccountOverdraw  source UnitTests, candidate
  - AccountService/ProtectFunds/RejectAtBoundary  source intent, candidate
  collision terms: Account.balance@post, Account.balance@pre, Account.floor@pre, Withdraw.args.amount, Withdraw.result
  inputs: identical
  a shared input: Account.balance@pre = 5000, Account.floor@pre = 0, Withdraw.args.amount = 10000
  Four readings, and the harness chooses none:
    1. One example is wrong.
    2. An unstated input separates them.
    3. The intent is undecided, and a person must decide it.
    4. The event may answer the same input in more than one way.

== Gap view

  subject                                              intent      DesignNotes Product     UnitTests   model      
  Account.balance                                      asserts     silent      silent      exemplifies models     
  Account.floor                                        asserts     silent      silent      exemplifies models     
  Withdraw                                             asserts     silent      silent      exemplifies models     
  Withdraw.args.amount                                 asserts     silent      silent      exemplifies models     
  Withdraw.result                                      asserts     silent      silent      exemplifies models     
  AccountService/ProtectFunds/MinimumBalance           asserts     silent      silent      exemplifies models     
  AccountService/ProtectFunds/RejectInsufficientFunds  asserts     silent      silent      exemplifies models     

  Derived gaps (a gap is not a failure):
  - unliftable  DesignNotes: DesignNotes docs/design-notes.json:1: unknown-term
  - no-rule  AccountService/@UnitTests/WitnessAcceptsAWithdrawalWithinTheBalance: no requirement on Withdraw has a trigger this example meets
  - single-source  AccountService/ProtectFunds/MinimumBalance: Account.balance, Account.floor asserted only by intent
  - single-source  AccountService/ProtectFunds/RejectInsufficientFunds: Account.balance, Account.floor, Withdraw.args.amount, Withdraw.result asserted only by intent
  - uncited  Product/ACC-008: docs/requirements.md:6: no fragment cites it

== Obligations

  conflicting (specification)  AccountService/ProtectFunds/MinimumBalance  [candidate; evidence inapplicable]  example-conflict: 0ad442418095eaee; example-conflict
  conflicting (specification)  AccountService/ProtectFunds/RejectInsufficientFunds  [candidate; evidence inapplicable]  example-conflict: 2d00bb5c9d716a5c; example-conflict

== Counts

  findings 3: state-conflict 0, joint-conflict 0, example-conflict 2, example-divergence 1, vacuous 0, not-preserved 0, not-met 0, unknown 0
  gaps 5; not comparable 0; unliftable 1
  obligations 2: conflicting 2, violated 0, satisfied 0, unknown 0
```

How to read this report:

- **Two cross-source conflicts.** The premium overdraw test lifts as the example `WitnessLetsAPremiumAccountOverdraw` ([ADR-13](adr/ADR-13-passing-test-is-claim-and-witness.md)). That example is consistent on its own, and so are `MinimumBalance` and `RejectInsufficientFunds`. But no state satisfies the example together with either of them. Each minimal set has two members from two sources, with the terms on which they collide. The harness offers three readings and chooses none.
- **One divergence between examples.** The same test also meets the intent's own example `RejectAtBoundary` on identical inputs: a balance of 5,000, a floor of 0 and a withdrawal of 10,000. The test says accepted and the example says rejected. Two examples that disagree are a divergence, not a conflict, because the harness does not assume an event answers one input one way ([A-36](../ASSUMPTIONS.md)). It offers four readings. Declaring `Withdraw` `deterministic` would turn this one into a third conflict.
- **The gap view.** Each row is a term or obligation, and each column a source. `UnitTests` exemplifies everything; `Product` and `DesignNotes` assert nothing the model can read. The derived gaps say more:
  - The design note is held as `unliftable`, with its original text kept (P4).
  - No requirement covers the test that accepts a withdrawal within the balance (`no-rule`).
  - Both obligations rest on the intent alone (`single-source`).
  - `ACC-008` is cited by no fragment (`uncited`).
- **Obligations.** Both are `candidate`, because no person has approved anything. Their verdict is `conflicting`, in specification scope. Their evidence is `inapplicable`, since every witness depends on bindings that are not approved yet. You can see that in `reports/csh-report.json`: each evidence record says `binding-not-approved: Account.balance`.
- **No score.** The counts come last, and nothing adds them up ([ADR-10](adr/ADR-10-four-axes.md)).

`csh check` exited 0 although it found conflicts. Reporting and judging are separate powers ([ADR-11](adr/ADR-11-check-never-blocks.md)).

## 4. Explain one finding

```text
$ csh explain 0ad442418095eaee
example-conflict 0ad442418095eaee (cross-source), from Q-EX(AccountService/@UnitTests/WitnessLetsAPremiumAccountOverdraw)

AccountService/@UnitTests/WitnessLetsAPremiumAccountOverdraw  source UnitTests, candidate, sha256:2364ec04b905849cf4d9ef617ea226dccdcd51eee31c8b4bc23c967c6b895c01
    i.example("WitnessLetsAPremiumAccountOverdraw", {
      given: { balance: u_minor_EUR(5000), floor: u_minor_EUR(0) },
      when: Withdraw({ amount: u_minor_EUR(10000) }),
      then: ({ pre, post, args, result }) => and(result.eq(Outcome.Accepted), post.balance.eq(u_minor_EUR(-5000)), post.floor.eq(u_minor_EUR(0))),
    });

AccountService/ProtectFunds/MinimumBalance  source intent, candidate, sha256:92fbcb2b7828a7a02c20bbf7579913c53aae8424a12754e55c83cf2380a2cbeb
    i.invariant("MinimumBalance", Account.balance.gte(Account.floor));

Context: AccountService/ProtectFunds/PositiveAmount
Collision terms: Account.balance@post, Account.floor@post

Three readings, and the harness chooses none:
  1. A member is wrong.
  2. A context is missing.
  3. The intent is undecided.
```

`csh explain` renders each member through the canonical printer, so the person reads what was emitted, not what the
source file looked like. A lifted example prints with generated names for unit constants (`u_minor_EUR`).

## 5. Gate

```text
$ csh gate
gate allow (advisory)

  candidate, never blocking: AccountService/ProtectFunds/MinimumBalance, AccountService/ProtectFunds/RejectInsufficientFunds
```

The gate considers approved obligations only. Both obligations are candidate, so nothing can block, and the gate lists
them as never blocking. An agent cannot make the gate block, or pass, by writing candidate fragments
([ADR-28](adr/ADR-28-candidates-never-block.md)). The gate runs the check itself rather than trusting a report file. The decision is written to
`reports/csh-gate.json` and bound to the snapshot digest. `csh gate --verify` recomputes it and refuses a decision
for a later commit, or one that was edited.

## 6. Draft an approval

```text
$ csh approve AccountService/ProtectFunds/MinimumBalance --actor Leigh --rationale "The floor protects customer funds."
approve AccountService/ProtectFunds/MinimumBalance
  digest sha256:92fbcb2b7828a7a02c20bbf7579913c53aae8424a12754e55c83cf2380a2cbeb

    i.invariant("MinimumBalance", Account.balance.gte(Account.floor));

  Findings that involve it:
    example-conflict 0ad442418095eaee
  Gaps that involve it:
    single-source: Account.balance, Account.floor asserted only by intent
  Approving it makes its verdict count at the gate.

Appended seq 1 to csh/ledger.ndjson. Nothing is committed or signed.
To make it count, commit that file alone, signed with your own key:
  git add csh/ledger.ndjson && git commit -S -m "approve MinimumBalance"
```

```text
$ git status --short
?? csh/ledger.ndjson
```

`csh approve` prints the fragment, its digest, and the findings and gaps that involve it, then appends one line to
`csh/ledger.ndjson`. It commits nothing ([ADR-25](adr/ADR-25-drafts-never-commit.md)). The line carries authority only
once a person listed in `csh/maintainers.json` commits that file alone, signed with their own key
([ADR-15](adr/ADR-15-ledger-of-signed-commits.md)). This walkthrough stops here, because the build never signs as a
person (Implementer's brief, rule 3).

## What would happen next

These steps need a person's signing key, so they are not run here. The fixtures cover each of them, either in throwaway
repositories signed with test-only keys or with a stand-in for the ledger:

1. The owner approves `MinimumBalance`, the bindings and `RejectInsufficientFunds` in signed commits. Fixtures F40 to F43 and F60 to F64 run signed approvals, and the rules that reject invalid ones, in real repositories.
2. On the next `csh check`, the witnesses become applicable. The premium overdraw witness then violates `MinimumBalance`, in implementation scope (fixture F30).
3. `csh gate --mode enforcing` blocks on the violation and exits 1. A signed waiver turns the block into `waived` until its expiry, and the verdict stays `violated` (fixture F44, P9).
4. Alternatively, the owner resolves the conflict with reading 2. Premium accounts get a vocabulary term and a guarded invariant, and the example no longer conflicts.
