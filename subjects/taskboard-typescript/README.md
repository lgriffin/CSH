# taskboard-typescript, a subject profile

This directory evaluates the TypeScript receiver of [the Assertion Ladder](https://github.com/lgriffin/AI-Reference-Projects/tree/master/paper),
`taskboard` in the directory `typescript` of [AI-Reference-Projects](https://github.com/lgriffin/AI-Reference-Projects), from
outside. It is one of the three profiles of stage 51 ([15](../../docs/spec/15-assertion-ladder.md), section 7), pinned to
commit `ce2767cadf01aa9cd664d718d057cd6431a01489`. The subject is only read; nothing is written to it.

```
node packages/cli/bin/csh.js subject fetch --root subjects/taskboard-typescript   # clone it at the pinned commit
node packages/cli/bin/csh.js run --root subjects/taskboard-typescript             # evaluate it
node packages/cli/bin/csh.js ladder --root subjects/taskboard-typescript          # each requirement's rung
node packages/cli/bin/csh.js expect --root subjects/taskboard-typescript          # compare with the expected results
```

The repository states no licence, so CSH commits from it identifiers, paths, lines and the commit, never its text. The
checkout and the run reports stay under this directory's `.csh-cache/` and `reports/`, which git ignores.

The expected results are [`csh/expected.json`](csh/expected.json), written from the paper and the receiver's
`REQUIREMENTS.md` and `AGENTS.md` before CSH was first run on it. CI runs the profile in the job
`Subject (taskboard-typescript)`.

## What it reads

| Source | Kind | At |
| --- | --- | --- |
| Requirements | Documents | `typescript/REQUIREMENTS.md`: ten rules, `R-FLOW-1` to `R-ERR-1`, as headings |
| Instructions | Documents | `typescript/AGENTS.md` and `typescript/CLAUDE.md`, in a practice of kind `instructions` |
| Tests | TestFiles | `typescript/tests/**/*.test.ts` |
| Code | Code | `typescript/src/**/*.ts`, `typescript/package.json` |

## The rules and the claim

- Seven architecture rules state the rows of the "Where things go" table in `typescript/AGENTS.md`: which layer may depend
  on which, and that the domain uses no framework. Each cites `typescript/AGENTS.md`.
- One structural claim, `Prevented/ErrorStatusIsTotal`, cites `R-ERR-1`: `STATUS_BY_CODE` in `typescript/src/api/error-handler.ts` is a `Record<ErrorCode, number>`, so an error code with no HTTP status does not compile (`typescript/AGENTS.md:60`).

Every rule and claim is a candidate. The receivers' authors, not this profile, decide whether it says what the documents
mean, so none of them raises a rung: the rungs come from the receiver's own tests and compiler.

## At the pin

`csh expect` finds every expectation met: 8 obligations satisfied, 0 gaps, 0 indeterminate. The ladder: 9 rules checked (L3) and `R-ERR-1` prevented (L5).
