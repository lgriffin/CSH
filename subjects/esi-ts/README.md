# ESI.ts, a subject profile

This directory evaluates [ESI.ts](https://github.com/lgriffin/ESI.ts) from outside. ESI.ts is the owner's TypeScript client for the EVE Online ESI API. The profile is pinned to commit `2a2da8a` (v11.3.0). ESI.ts is only read; nothing is written to it ([11](../../docs/spec/11-ingesting-a-codebase.md)).

```
node packages/cli/bin/csh.js subject fetch --root subjects/esi-ts   # clone ESI.ts at the pinned commit
node packages/cli/bin/csh.js run --root subjects/esi-ts             # evaluate it
```

The clone, the runs and the reports stay under this directory's `.csh-cache/` and `reports/`, which git ignores. ESI.ts is GPL-3.0 and CSH is MIT, so only identifiers, paths, spans and digests from ESI.ts are committed here, never its text ([#37](https://github.com/lgriffin/CSH/issues/37)).

## What it reads

| Stage | Practice | Source | Result at `2a2da8a` |
| --- | --- | --- | --- |
| 21 | Charter | `guides/CHARTER.md` | 0 items and the warning `no-items`: the 66 requirements are headings, which the EARS adapter does not read yet |
| 22 | Charter | `guides/CHARTER.md`, through the Markdown inventory adapter | 66 requirements and 240 verified-by edges. Eight requirements are `unverified`: ARCH-03, DES-05, DOC-06, PROC-01, PROC-02, PROC-04, PROC-05 and REL-04, each verified by prose alone. DOC-01 is verified by `guides/MUTATION-TESTING.md`, which no longer exists, and the charter names seven other paths that are not tracked |
| 22 | Guides | `guides/**/*.md` but the charter | 29 documents, 81 implements edges, all resolved; 25 backticked paths in 8 guides name no tracked file |
| 22 | BDD | `tests/bdd/features` | 77 features, 619 rules and 792 scenarios; every rule has a scenario |
| 22 | TDD | `tests/**/*.test.ts` but fixtures | 261 test files and 3,902 tests, parameterised ones included; only 10 cite a charter requirement in a title, and 4 declare no test with a literal title |
| 22 | Beads | `.beads/issues.jsonl` | 69 issues, 63 mentions of charter requirements |
| 23 | Code facts | `src/**/*.ts` and `package.json`, through `facts-ts` | 288 modules, 1,116 dependencies, 3,024 exports and 35 manifest fields, none skipped, with nothing installed. Lockfile-only commits such as `54f7b20` give identical facts |
| 23 | Layering | [`csh/spec.csl.ts`](csh/spec.csl.ts), three candidate rules over modules | ARCH-03's rule (the request pipeline takes the cache, rate limiter and circuit breaker as parameters) and both ARCH-10 rules (the SDE imports only ports and peers, and nothing imports the SDE) are `satisfied` at `2a2da8a` |

Stage 22 reports half of row 9: ARCH-03 is `unverified`. Stage 23 reports the other half: ARCH-03 can be checked, and its rule holds. The charter still says code review is the only check, and ARCH-03 stays `unverified` until a person approves the rule. Seeing that a satisfied rule contradicts the charter's own word is stage 24's work (claims). The `dangling-reference` gaps for files that were deleted, such as `guides/MUTATION-TESTING.md`, need history to tell a stale mention from a mention of a deletion, and DOC-01 is the second kind. That is stage 25's.

Each later stage adds a row, until the eleven disagreements listed in [11](../../docs/spec/11-ingesting-a-codebase.md) are reported or listed as unknown with a reason.
