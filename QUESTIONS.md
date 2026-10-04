# Questions for the owner

Places where the documents are silent, ambiguous or contradictory (Implementer's brief, rule 2). Each entry gives
the options, what each implies, and the answer chosen, registered in [ASSUMPTIONS.md](ASSUMPTIONS.md).

**Q-01 to Q-20 are decided.** On 3 October 2026 the owner accepted the answer the build had taken for each of Q-01 to
Q-17, including the composition fixtures F70 to F78 as written, and later that day the cautious answer for each of Q-18
to Q-20 ([#5](https://github.com/lgriffin/CSH/issues/5), [#9](https://github.com/lgriffin/CSH/issues/9),
[#12](https://github.com/lgriffin/CSH/issues/12)). A new question gets the next number and stays open until the owner
answers it.

## Q-01 Which Node release is "the current long-term-support release"?

On 3 October 2026, Node 24 is the active LTS line and Node 22 is in maintenance LTS. The build container has Node 22.22.

- **Node 24 only.** This matches the wording, but the tool could not be run in the build environment.
- **Node 22.18 or later (chosen).** Type stripping is on by default and the permission model is stable. The tool runs on both lines, and CI tests both.

Decided on 3 October 2026: the chosen option. Recorded as A-25.

## Q-02 How is a strengthening accepted by "recorded review" (composition rule 4)?

The main tab, section 6.3, allows a local obligation to strengthen an inherited one "through a refinement check or a
recorded review". No document defines the review record.

- **Solver check only (chosen).** When the check cannot show strengthening, emission fails with `E-WEAKEN`. The profile can relax the obligation explicitly. This rejects more, which is conservative.
- **A new ledger decision kind**, such as `refine`, signed by a domain reviewer. This needs a schema change in the Authority tab.

Decided on 3 October 2026: the chosen option. Recorded as A-23.

## Q-03 F21 produces two findings the document does not list

The Semantic contract, section 7.3, expects one joint conflict for F21: the two requirements under Q-FEAS. The
query definitions also produce two more findings. Q-EX gives an `example-conflict` between the base example
`RejectAtBoundary` and the new requirement. Q-MEET gives a `not-met` finding: the model rejects a withdrawal of at
most 10,000 that would cross the floor, so the transition does not meet the new requirement.

- **Report them (chosen).** They follow from the definitions, and hiding them would be a silent filter. The fixture expects all three.
- **Report only the Q-FEAS finding.** That would need a rule that suppresses findings once a joint conflict exists, and no document gives one.

Decided on 3 October 2026: report all three. Recorded in `fixtures/F21/README.md`.

## Q-04 How are cycles of mutual assumptions detected?

The main tab, section 6.3, says that "a cycle of mutual assumptions is reported as unresolved". Version 1 packs carry
obligations and vocabulary but no assume–guarantee pairs, so no cycle can form.

- **Not implemented (chosen)**, until packs gain assume–guarantee contracts.
- **Implement a dependency graph over assumptions now.** It would have nothing to run on.

Decided on 3 October 2026: the chosen option. Recorded as A-24.

## Q-05 Can stale evidence ever be refreshed without re-running the test?

The Authority tab, section 5, makes evidence stale when a dependency changes. It does not say whether evidence can
return to current.

- **Never (chosen).** A new witness must be recorded at the new snapshot.
- **Re-judge when only the obligation's digest changed.** The witness values are unchanged, so the new obligation could be evaluated on them. But a change in meaning may need a different test.

Decided on 3 October 2026: the chosen option. Recorded as A-15.

## Q-06 Which assumptions apply to which query, and which source do transitions belong to?

The Semantic contract defines the queries "in a shared context C" without saying which assumptions make up C. It also
does not say which source transitions and bindings belong to.

- **By scope (chosen).** An assumption applies when it speaks about the state of the query, or about the event of the query. Transitions and bindings belong to a pseudo-source `model`.
- **All assumptions everywhere.** This could make unrelated queries vacuous.

Decided on 3 October 2026: the chosen option. Recorded as A-04, A-05.

## Q-07 What is the verdict of an approved obligation with no policy?

- **unknown, reason `no-policy` (chosen).** No method says what evidence would satisfy it (P3).
- **satisfied when no finding involves it.** This would be a silent pass.

Decided on 3 October 2026: the chosen option. Recorded as A-02.

## Q-08 Is a witness for another event inapplicable, or simply not evidence?

- **Not evidence (chosen).** It is left out of the obligation's evidence list. It still appears in the report's `executions`.
- **Inapplicable with reason `event-mismatch`.** Every witness would be listed under every obligation, which makes reports long.

Decided on 3 October 2026: the chosen option. Recorded as A-06.

## Q-09 Which queries run for a state that Q-STATE finds inconsistent?

Every formula is satisfied vacuously in an inconsistent state, so downstream queries would report noise.

- **Skip them (chosen).** Obligations on the state are marked skipped with reason `state-conflict`.
- **Run them all.** Every vacuity and feasibility answer on that state would be meaningless.

Decided on 3 October 2026: the chosen option. Recorded as A-07; fixture F13.

## Q-10 Do candidate fragments affect the verdict of an approved obligation?

The Semantic contract's verdict order says an obligation is conflicting when it is in a finding. It does not say
whether a finding with a candidate member counts against an approved obligation.

- **Only all-approved findings count (chosen).** A candidate, which an agent can write, cannot make an approved obligation conflicting or block the gate. The finding is still reported, with its members' authority.
- **Every finding counts.** An agent could then block delivery by writing one conflicting candidate.

Decided on 3 October 2026: the chosen option. Recorded as A-10.

## Q-11 What exactly is a single-source gap?

The Joint evaluation tab lists a gap where one practice asserts something the others are silent on, but gives no
precise test.

- **Every term the obligation constrains is asserted by one source only (chosen).**
- **The obligation itself is cited by no other source.**

Decided on 3 October 2026: the chosen option. Recorded as A-12.

## Q-12 What is the snapshot of a working tree with uncommitted changes?

- **`HEAD-dirty` (chosen).** Witnesses are never current against it, and the gate refuses to decide for it unless its report has the same snapshot.
- **HEAD.** A decision would be bound to a commit that does not hold what was checked (CSH-010).

Decided on 3 October 2026: the chosen option. Recorded as A-16.

## Q-13 Which files count as "implementation" for staleness?

The Authority tab, section 5, makes evidence stale when the implementation changes, without saying which files.

- **Everything outside `csh/` unless configured (chosen).** Evidence becomes stale more often, which is conservative.
- **Nothing unless configured.** Evidence would stay current after any code change.

Decided on 3 October 2026: the chosen option. Recorded as A-17.

## Q-14 Which git signature statuses count, and who authored an unsigned change?

- **`G` or `U`, with trust from `csh/maintainers.json` (chosen).** An unsigned or unknown author is `unattributed` and never ends a self-approval.
- **`G` only.** This needs every maintainer key marked trusted in each CI keyring, which duplicates the maintainers file.

Decided on 3 October 2026: the chosen option. Recorded as A-18, A-19.

## Q-15 Can the report carry fields the documents do not list?

- **Yes, marked as extensions (chosen).**
- **No.** Unliftable content, harness errors and executions would then have no place in the report, against P2 and P4.

Decided on 3 October 2026: the chosen option. Recorded as A-01.

## Q-16 How should SSH-signed commits be verified?

The owner may sign with OpenPGP or SSH keys. Git verifies SSH signatures only against an allowed-signers file. That
file would be a second list of trusted keys beside `csh/maintainers.json`.

- **Use git's verification for both (chosen).** CI configures `gpg.ssh.allowedSignersFile` from the maintainers file. Only the OpenPGP path is tested by fixtures.
- **Verify SSH signatures in the harness** with `ssh-keygen -Y verify` against keys taken from `csh/maintainers.json` directly.

Decided on 3 October 2026: the chosen option. Recorded as A-26.

## Q-17 Do the composition fixtures F70 to F78 express the owner's intent?

The brief asks for these fixtures to be written first and flagged for owner review. They are in `fixtures/F70` to
`fixtures/F78`. The owner accepted them as written, and their review flags were removed. They cover: pinned packs, lock mismatch, missing lock, vocabulary
disagreement, strengthening, silent weakening, explicit relaxation, a second unrelated domain, and a conflict between
local and inherited obligations.

Decided on 3 October 2026: the chosen option. Recorded as A-32.

## Q-18 How does a packed package run from `node_modules`?

The anchor design (09, section 10.4) installs the harness from tarballs made by `pnpm pack`. Verified on 3 October 2026
with Node 22.22: `pnpm pack` packs a package marked private, and Node refuses to strip types from a file under
`node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). A packed package whose exports point at TypeScript
source therefore cannot run. [ADR-18](docs/adr/ADR-18-no-build-step.md) says the tool runs TypeScript directly, with no
build step.

- **Compile only when packing (chosen).** The workspace keeps running TypeScript directly, as ADR-18 says. Packing compiles each package to JavaScript with `tsc` and points the packed package's exports at the compiled files (`publishConfig`). The tarballs are the only place compiled code exists, and fixture F96 tests them.
- **Compile always.** Every package exports compiled JavaScript, and the workspace builds before it runs. This reverses ADR-18.
- **Ship source and require a loader.** Users would run Node with a TypeScript loader; nothing in Node supports this under `node_modules` without a third-party dependency.

Decided on 3 October 2026: the chosen option ([#5](https://github.com/lgriffin/CSH/issues/5)). Recorded as A-40; stage 16 built it, and F96 installs the starter from those tarballs.

## Q-19 Do tabs 00 to 08 take the amendments of 09, section 6.5?

Raised in stage 13. Tracked as [issue #9](https://github.com/lgriffin/CSH/issues/9).

Section 6.5 lists amendments to the semantic contract, joint evaluation, evidence, ledger and architecture tabs: Q-DIV,
`deterministic`, the new finding and gap kinds, witness version 2 and `cites`, `componentDigest`, and three
containers. The implementer may not edit tabs 00 to 08.

- **Record them in 09 and the decision records (chosen).** The tabs are unchanged; 09, ADR-33, ADR-34 and A-36 to A-44 are the record.
- **The owner amends the tabs.** The tabs stay the single source, and 09 becomes history.

Decided on 3 October 2026: the chosen option ([#9](https://github.com/lgriffin/CSH/issues/9)). Tabs 00 to 08 stay as they are, and 09 with its decision records is the record of the anchor design. Nothing in the code depends on the answer.

## Q-20 How should the gate's own unit tests feed the harness?

Raised in stage 15. Tracked as [issue #12](https://github.com/lgriffin/CSH/issues/12).

The gate component's test practice is its unit tests with a probe around `gate` (09, section 8). Those tests run under
vitest, and `@csh/harness` has a reporter for Node's test runner only, without which no witness becomes a claim.

- **A separate probe file (chosen).** `packages/gate/test/gate.probe.ts` repeats the cases of `gate.test.ts` under `node --test`. The two copies could drift apart; `packages/gate/test/probe-agrees.test.ts` checks that they state the same table and that every probe case is a unit test.
- **A vitest reporter in `@csh/harness`.** The repository's tests are probed where they are; a second reporter keeps to the identity rules of A-39.
- **The gate's tests move to Node's test runner.** One copy, outside the vitest suite.

Decided on 3 October 2026: the chosen option, with the agreement check ([#12](https://github.com/lgriffin/CSH/issues/12)). Recorded as A-49.

## Q-21 How does `csh diff` run the merge base of a pull request?

Raised before stage 17, while verifying section 10 of [10](docs/spec/10-next-layers.md).

Section 5.1 has `csh diff <base> <head>` run either side that has no stored run. A run at a past commit (`csh run --at`)
uses the working tree's installation and refuses a commit whose dependencies or workspace packages differ from it
(A-38, A-55). A pull request that changes a package the component resolves is exactly that case, so the merge base
would always be refused in CI.

- **The CI job runs the base in a checkout of its own (chosen).** A second worktree at the merge base, installed with `pnpm install --frozen-lockfile`, runs its own `csh run`; `csh diff` takes that stored run's directory as the base. A side that cannot be installed or run is `base-unavailable`, and the diff shows the head alone. `csh diff` given a commit still runs it with `csh run --at`, and reports `base-unavailable` with the refusal's reason when that is refused.
- **`csh run --at` installs the commit's dependencies.** One mechanism for every caller, but the harness would then run package installs, which A-38 rules out.

Taken provisionally as A-77, the option that installs nothing inside the harness.

## Q-22 Where is the gate's regression commit kept?

Raised before stage 17. Section 3.2 of [10](docs/spec/10-next-layers.md) keeps the regression on the gate's A3 as "a
commit, kept under a tag and never merged" that edits `gate.ts` and its probe together.

- **As files in the repository, applied in a scratch copy (chosen).** `packages/gate/regression/` holds the edited `src/gate.ts` and `test/gate.probe.ts`, as `examples/lockout/regression/` does for the lockout. The test of stage 17's exit copies the gate component into a scratch repository, signs approvals with a test-only key, commits the regression there, and records that the enforcing gate job blocks it. No tag is pushed, and `gate.ts` in the repository is never changed.
- **A tagged commit.** Exactly what section 3.2 says, but a tag is a ref outside the branch every change is reviewed on, and a stage recorded at it in the real gate A3 would show an allow until the owner approves anything, since candidates never block.

Taken provisionally as A-78. The regression stage of the gate's own A3 is recorded once the owner's approvals exist;
until then the scratch copy is where the block is shown.
