# Stage 7: Authority and invalidation

**Exit:** F40 to F43, F46, F51, F60 to F64.

**Status:** exit reached. All 51 fixtures pass at the end of the build.

## Built

- `ledger`: the maintainers history, entry validation with every rule of the Authority tab, authority resolution, waivers, authorship, and drafting.
- Real signature verification through git, behind a version-control port with an in-memory fake ([ADR-21](../adr/ADR-21-signatures-through-git.md)).
- Snapshots and staleness, and the solver cache and evidence store ([ADR-23](../adr/ADR-23-caches.md)).

## Effort

Medium: about 500 lines in `ledger`, plus the git test helper that creates throwaway, test-only gpg keys. Effort was not timed. The build ran as one continuous session, so effort is given as code size and the number of correction rounds.

## What the fixtures revealed

- Git reports a good signature from a key the keyring does not trust as `U`, not `G`. Trust comes from `csh/maintainers.json`, so both are accepted ([A-18](../../ASSUMPTIONS.md), [Q-14](../../QUESTIONS.md)).
- F62 needs the author of a fragment at a digest. Authorship is computed by emitting the specification at each commit in a temporary worktree ([A-19](../../ASSUMPTIONS.md)). This is the slowest part of a check with two or more persons listed.
- F64 confirms that an incremental run, reusing caches, produces a byte-identical report to a full run.

## What proved wrong or costly in the documents

Signature verification for SSH keys is designed but untested here ([Q-16](../../QUESTIONS.md)). Which files count as implementation for staleness is not defined ([Q-13](../../QUESTIONS.md)).
