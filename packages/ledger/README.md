# @csh/ledger

## Purpose

`@csh/ledger` reads the decision ledger (`csh/ledger.ndjson`) and the maintainers file (`csh/maintainers.json`) from version-control history, decides which entries are valid from what each commit shows, and resolves every fragment to approved, candidate or retired. It also drafts new decision lines for a person to commit and sign; it never commits or signs anything itself.

## Where it sits

It is the "Ledger and authority" container, shown in the [containers diagram](../../docs/architecture/containers.mmd). Its components (maintainers reader, signature port, entry validator, authority resolver) are in [components-ledger.mmd](../../docs/architecture/components-ledger.mmd). It runs in the main process and reads git.

## Public interface

- `Maintainers`, `Identity`, `Role`, `persons`: the maintainers file, with person and agent identities, key fingerprints and roles.
- `Decision`, `DecisionKind`: one ledger line (`approve`, `reject`, `retire`, `waive` or `countersign`) bound to a fragment name and digest.
- `ValidEntry`, `InvalidEntry`, `LedgerState`: the result of reading history (valid entries, invalid entries with reasons, head, maintainers in force).
- `LEDGER_PATH`, `MAINTAINERS_PATH`: the two file locations.
- `VcsPort`, `CommitInfo`: the version-control port (commits, signatures, file contents, ancestry).
- `gitVcs(dir, opts)`: the git implementation, using `%G?` and `%GF`/`%GP` for signatures.
- `memoryVcs(commits)`, `MemoryCommit`: an in-memory history for rule tests.
- `normaliseFingerprint`: case-insensitive fingerprint form.
- `readLedger(vcs, opts)`, `ReadOptions`: read every entry in history and decide which count.
- `maintainersHistory(vcs, opts)`, `identityOf(m, sig)`: the maintainers file as it validly stood at each change, and the identity behind a signature.
- `resolveAuthority(state, fragment, items)`, `AuthorityInfo`, `FragmentRef`: authority of one fragment, including self-approval and review status.
- `waiversFor(state, fragment)`: valid waivers at the fragment's current digest.
- `authorship(vcs, specPaths, digestsAt, opts)`: who last changed a fragment's digest, for the self-approval rule.
- `nextSeq`, `formatDecision`, `appendDecision`: draft a ledger line with the next sequence number.

## Depends on and used by

- Depends on: `@csh/kernel` is listed in `package.json`, but no source file imports it. External: the `git` executable (and gpg or SSH signing as configured in git), called through `node:child_process`.
- Used by: `@csh/cli` (decision commands, authority for `csh check`, waivers for `csh gate`) and `@csh/testkit` (ledger fixtures).

## Invariants it protects

- Authority comes only from valid, signed decisions in history, never from the specification text (P1, CSH-015).
- An approval binds to a digest: when a fragment's digest changes, it returns to candidate with reason `digest-changed` (P1, CSH-017).
- An approval that cited source items returns to candidate with `source-text-changed` when a cited text digest changes (P1, P5).
- An entry is invalid if its commit is unsigned (`unsigned`), signed by a key not listed (`unknown-key`) or by an agent (`agent-key`), also edits other files (`mixed-commit`), rewrites earlier lines (`not-append-only`), lacks the needed role (`missing-role`), names another actor (`actor-mismatch`) or has no rationale (`no-rationale`). Invalid entries are listed, never silently ignored (P6, CSH-016).
- Self-approval is allowed only while one person maintains; once a second person is listed, a new self-approval is invalid and an earlier one needs a countersign by a different person (P6).
- A change to the maintainers file counts only when signed by a person already listed (P6).
- Waivers are returned with scope and expiry, and the underlying finding is untouched (P9, CSH-013).
- Drafting appends a line and stops; nothing is committed or signed (P6).

## Rationale

Authority lives in a ledger of signed commits ([ADR-15](../../docs/adr/ADR-15-ledger-of-signed-commits.md)) and follows the digest ([ADR-07](../../docs/adr/ADR-07-approval-follows-digest.md)). Signatures are verified through git behind a version-control port so that the rules can be tested in memory ([ADR-21](../../docs/adr/ADR-21-signatures-through-git.md)). Decision commands only draft ([ADR-25](../../docs/adr/ADR-25-drafts-never-commit.md)). Trust in a key comes from the maintainers file, not the keyring ([A-18](../../ASSUMPTIONS.md)); authorship is the signer of the last digest change ([A-19](../../ASSUMPTIONS.md)); a rewriting commit invalidates only what it adds or changes ([A-20](../../ASSUMPTIONS.md)); SSH signatures need git's allowed-signers file ([A-26](../../ASSUMPTIONS.md)); the root commit defaults to the first commit that added the maintainers file ([A-28](../../ASSUMPTIONS.md)).

## How it is tested

- `test/ledger.test.ts` (on `memoryVcs`): a signed, append-only entry by a listed person counts; a rewriting commit is rejected; the needed role is required; self-approval ends with a second person; a countersign must come from a different person on a self-approved approval; an unauthorised maintainers change is ignored; authority returns to candidate on a digest change or changed cited text; reject then retire is followed; waivers are listed at the current digest only; drafting refuses an empty rationale.
- Fixtures (real git and throwaway gpg keys from `@csh/testkit`): F40, F41 and F46 (digest changes), F42 (unsigned), F43 (agent key), F51 (cited text changed), F60 (mixed commit), F61 (rewrite), F62 and F63 (self-approval), F64 (binding change).

## Known limits

- Only the OpenPGP signing path is exercised by the fixtures; SSH depends on git configuration ([A-26](../../ASSUMPTIONS.md)).
- Unless CI pins the root with `CSH_ROOT_COMMIT`, the trusted root is the first commit that added the maintainers file ([A-28](../../ASSUMPTIONS.md)).
- Authorship emits the specification at every commit that touched it, which grows with history; it runs only once a second person is listed.
- Waiver expiry is not judged here; the gate compares it with the snapshot commit date.
