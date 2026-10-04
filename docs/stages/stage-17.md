# Stage 17: Authority

**Exit:** F97, F98 and F99 pass: a component with no ledger reports as unprotected, a root that is not pinned is
reported as taken from history, and a stored decision for another snapshot is shown as out of date. In a scratch copy
of the gate component signed by a test-only key, the enforcing CI gate job allows the approved state and blocks the
regression commit. Every earlier fixture and both walkthroughs stay green.

**Status:** the exit the implementer can reach is reached. The real exit is the owner's eight steps below, after which
`csh status` on `packages/gate` reports a pinned root, approved rules and an enforcing gate. None of them is taken: as
rule 19 says, no key, maintainers file or ledger was created under `packages/gate` or the repository root.

## Built

- `csh status [--json]` and `componentStatus` in `run` ([10](../spec/10-next-layers.md), section 3.2): the root of
  trust (`pinned` by `CSH_ROOT_COMMIT` and checked to hold the maintainers file, `history`, or `none`), the
  maintainers, the specification's fragments by authority with the self-approved ones counted, each A3's authority, the
  ledger's head and invalid entries, the gate mode, and the stored decision judged against the snapshot `csh run` would
  compute now. It says `protected` only with a maintainers file, a pinned root, an approved fragment and an enforcing
  gate, and lists what it cannot see. It reads only, and exits 0 whenever it can read the component.
- The CI gate job, `.github/scripts/gate-job.sh`, run for `packages/gate` by a new `gate` job in
  `.github/workflows/ci.yml` with `CSH_ROOT_COMMIT` from a repository variable. It imports the public keys under
  `csh/keys/`, prints `csh status`, and, until a maintainers file was ever committed and while no root is pinned, stops
  there and passes (rule 20). After that it fails while the root is not pinned or cannot be used (A-91), and otherwise runs `csh run --mode enforcing` and `csh gate --verify` on the decision the run wrote. The workflow keeps
  `contents: read` and asks for nothing else (rule 23).
- The gate's regression, as files in `packages/gate/regression/` ([A-78](../../ASSUMPTIONS.md),
  [Q-22](../../QUESTIONS.md)): `gate.ts` returns `allow` for an unknown or stale verdict under a policy that is not
  critical, and the probe's two cases are edited to match, so its tests stay green.
- `packages/testkit/test/gate-job.test.ts`: the owner's steps 2, 3, 5 and 7 on a scratch copy of the gate component with
  a test-only key, then the job: it passes, with `csh status` saying `protected` and all seven rules satisfied; after
  the regression commit the harness still exits 0 and the job fails, `ReviewUnknown` blocked.
- [docs/guides/authority.md](../guides/authority.md): the eight steps as a runbook, with the commands.
- `testkit`: three-digit fixtures are listed in number order; a `status` expectation runs `componentStatus` on a scratch
  repository built from a scenario; `TestRepo.publicKey`. `BUILT_THROUGH_STAGE` is 17.

## The three corners

- C4: the context diagram names continuous integration as the place the gate runs, with `csh status`, the enforcing
  run and `--verify`. The command line and run component diagrams gain status. No container changes.
- Docs: the authority runbook; the root README's status block, which continuous integration executes with every other
  `sh` block; the run and command-line READMEs; A-69 to A-78, Q-21 and Q-22; the six verified points in
  [DEPENDENCIES.md](../../DEPENDENCIES.md).
- Example: the gate component, approved in a scratch copy, allowing, then blocking its regression.

## What moved on the lockout sheet

Nothing.

## Effort

Medium: about 160 lines of status, 30 of job script and workflow, 110 of test, 90 in the fixture runner, and the
runbook. Correction rounds: the first job printed `csh status` before importing the public keys, so status counted the
signed approvals as unsigned while the run, after the import, counted them approved; the job now imports first. The
regression first edited only the unknown case, and the probe's stale case failed, since `gate.ts` treats both alike.

## What the fixtures revealed

- F98: a maintainers file signed but not pinned is a root of trust only by convention (A-28); status keeps the two apart
  rather than reporting a root.
- The exit test showed what "approved" needs on the gate: with every fragment approved, all seven rules are satisfied,
  since the probe's witnesses cover each row; no rule is left unknown.

## What proved wrong or costly in the documents

- Section 3.2 keeps the regression as a tagged commit that is never merged. A tag is a ref outside reviewed history,
  and recorded in the real gate A3 it would show an allow until the owner approves anything; it is kept as files
  instead (Q-22), and the A3's regression stage waits for the owner's approvals.
- Section 5.1's `csh diff` runs a missing base with `csh run --at`, which refuses any merge base whose workspace packages
  differ (Q-21). Settled before this stage; stage 19 builds on it.

## The owner's eight steps

Section 3.1 of [10](../spec/10-next-layers.md), as a runbook in [docs/guides/authority.md](../guides/authority.md).
On 4 October 2026, at the end of this stage:

| Step | State |
| --- | --- |
| 1 Make a signing key that no agent can reach | Open |
| 2 Commit the maintainers file, signed | Open |
| 3 Pin the root outside the repository (`CSH_ROOT_COMMIT`) | Open |
| 4 Decide C2 | Open; the recommended order is registered as A-70 and already stated by GATE-001 to GATE-007 |
| 5 Review and approve the seven rules and the bindings | Open |
| 6 Decide the A3 | Open; the judgments stay candidate (A-71) |
| 7 Decide C5 | Open; recommended with the first approvals (A-72) |
| 8 Protect the workflow | Open |
