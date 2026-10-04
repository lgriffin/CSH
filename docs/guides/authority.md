# Making authority real

The harness can protect a component only once a person has a key, a maintainers file, a pinned root and signed
approvals, and continuous integration runs the enforcing gate. Every mechanism for that exists; this runbook is the
order in which the owner uses them on the gate component, `packages/gate`. It is section 3.1 of
[the next-layers design](../spec/10-next-layers.md), with the commands. Every step is the owner's: an agent can run
`csh status`, read what each step would change and draft ledger lines, but no agent key can approve, and nothing an
agent does stands in for these steps ([10](../spec/10-next-layers.md), rule 19).

Start, and finish, by asking what is protected:

```sh
node packages/cli/bin/csh.js status --root packages/gate
```

Today it prints `protection   unprotected` with four reasons: no maintainers file, the root not pinned, nothing
approved, an advisory gate. Each step below removes one of them, and the last line, `not seen`, names what the harness
cannot see at all: branch protection, who may change the workflows, and the pinned variable itself.

## 1. Make a signing key that no agent can reach

An OpenPGP key on a hardware token that needs a touch ([A-69](../../ASSUMPTIONS.md)), or a key on a machine no agent
runs on. SSH signatures are implemented but untested ([Q-16](../../QUESTIONS.md)), so OpenPGP for now.

```sh
gpg --card-edit                       # generate the key on the token, or move one to it
gpg --list-secret-keys --with-colons  # the fpr: line is the fingerprint the maintainers file lists
git config gpg.format openpgp
git config user.signingkey <fingerprint>
```

Keep the public half in the repository, so that continuous integration can verify your signatures. Anyone can replace
that file; it is harmless, because a replaced key has another fingerprint, which the maintainers file does not list.

```sh
gpg --armor --export <fingerprint> > packages/gate/csh/keys/owner.asc
```

## 2. Commit the maintainers file, signed

One person, both roles. This commit is the root of trust.

```json
{ "schema": "csh-maintainers/v1", "identities": [
  { "name": "<your name>", "kind": "person", "keys": ["<fingerprint>"], "roles": ["intent-owner", "domain-reviewer"] }
] }
```

```sh
git add packages/gate/csh/maintainers.json packages/gate/csh/keys/owner.asc
git commit -S -m "Gate maintainers: the root of trust"
git rev-parse HEAD                    # the root commit, for step 3
```

From this commit on, the CI gate job no longer passes by default. It decides from history, not from whether the file
is in the working tree, so a change that deletes `csh/maintainers.json` does not turn it off. Until step 3 pins the
root it fails, saying `CSH_ROOT_COMMIT` is not set, and it fails too when the variable names a commit that does not
hold the maintainers file ([A-91](../../ASSUMPTIONS.md)). With the root pinned it runs the component in enforcing mode
(`.github/scripts/gate-job.sh`). Nothing is approved yet, and candidates never block, so it allows.

## 3. Pin the root outside the repository

In the repository's settings on the hosting service, under the variables for Actions, add `CSH_ROOT_COMMIT` with the
hash from step 2. The workflow passes it to the gate job; a pull request cannot change a variable, only the workflow
that reads it, which is what step 8 protects. Without it the root is taken from history ([A-28](../../ASSUMPTIONS.md)),
and `csh status` says so.

## 4. Decide C2

The disposition table's rows apply in order, highest first: conflicting, violated, unknown or stale, self-approved
needing review, allow ([A-70](../../ASSUMPTIONS.md)). Tabs 00 to 08 stay unedited ([Q-19](../../QUESTIONS.md)); the
statement lives in [10](../spec/10-next-layers.md), section 10, and in the sentences GATE-001 to GATE-007, which
already say it. If you decide another order, edit the sentences and the model first; the edit returns them to
candidate, which is correct.

## 5. Review and approve

Read each of the seven rules and each binding through `csh approve`, which prints the fragment in full, the findings
and gaps that involve it, and what approving it unlocks, then appends one line to the ledger. It never commits or
signs. This is countermeasure C6 of the gate's A3.

```sh
node packages/cli/bin/csh.js run --root packages/gate     # free of conflicts; unknown only for unapproved bindings
cd packages/gate
node ../cli/bin/csh.js approve Gate/NoViolationAllowed/BlockConflicting --actor "<your name>" --rationale "<why>"
# ... the other six rules, then each binding:
node ../cli/bin/csh.js approve "Gate/#binding/Decide.args.verdict" --actor "<your name>" --rationale "<why>"
git add csh/ledger.ndjson && git commit -S -m "Approve the gate's rules and bindings"
```

The ledger commit must change the ledger and nothing else. Every approval is marked self-approved until a second
person joins.

## 6. Decide the A3

Approve the agent-written judgments as they stand, revise them, or reject them ([A-71](../../ASSUMPTIONS.md)). Their
fragment is `Gate/#a3/dispositions`; any edit returns the sheet to candidate.

```sh
node ../cli/bin/csh.js approve "#a3/dispositions" --actor "<your name>" --rationale "<why>"
git add csh/ledger.ndjson && git commit -S -m "Approve the gate's A3"
```

## 7. Decide C5, and switch the gate to enforcing

Whether the gate's own policy is critical, so that an unknown or stale approved rule blocks
([A-72](../../ASSUMPTIONS.md)). Making it critical edits `spec/gate.csl.ts`, which changes the policy's digest: approve
it again. In the same change as the first approvals, set `"mode": "enforcing"` in `packages/gate/csh/config.json`.

## 8. Protect the workflow

Require your review for changes under `.github/workflows` and `.github/scripts`, and for the branch protection
itself, in the hosting service's settings. An agent able to edit the workflow could remove the gate job; this setting
is what prevents that, and it is outside what the harness can check.

## Done

```sh
CSH_ROOT_COMMIT=<root commit> node packages/cli/bin/csh.js status --root packages/gate
```

reports `protection   protected`: a pinned root, a maintainer, approved rules and an enforcing gate. From then on a
change that breaks an approved gate rule cannot merge, whoever wrote it.
`packages/testkit/test/gate-job.test.ts` runs this runbook on a scratch copy with a test-only key, and shows the job
allowing the approved state and failing on the regression of `packages/gate/regression` ([A-78](../../ASSUMPTIONS.md)).
