# tutors-release-harness, a subject profile

This directory evaluates [tutors-release-harness](https://github.com/tutors-sdk/tutors-release-harness) from outside, as a diagnostic of CSH itself. The profile is pinned to `main` at `195e0d1` (v1.35.0). The subject is only read; nothing is written to it. Only identifiers, paths and counts from it are committed here, never its text.

```
node packages/cli/bin/csh.js subject fetch --root subjects/tutors-release-harness
node packages/cli/bin/csh.js run --root subjects/tutors-release-harness
node packages/cli/bin/csh.js overview --root subjects/tutors-release-harness
node packages/cli/bin/csh.js history releases --from v1.30.0 --to v1.35.0 --root subjects/tutors-release-harness
```

`csh/component.json` reads the Markdown documents (`Documents`), the 107 Vitest files (`TestFiles`), `mutants/mutants.yaml` (`Traces`, 16 planted mutants), the empty `scoreboard/releases.jsonl` (`Issues`) and `src`, `bin`, `package.json` and `docs/contract/*.json` (`Code`), with history since the previous tag. It has no `spec`, no requirement source (the repository has no requirement IDs or Gherkin) and no expected results.

At `195e0d1`: 208 items, 98 gaps (60 `stale-prose`, 22 `dangling-reference`, 16 `unverified` mutants), 0 indeterminate, 0 converged.
