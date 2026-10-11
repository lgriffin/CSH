# Stage 24: Structural claims

**Exit:** rows 1, 2, 3, 4, 7, 8 and 11 of the table in [11](../spec/11-ingesting-a-codebase.md) are reported, each claim
candidate.

**Status:** exit reached. `csh run --root subjects/esi-ts` judges eleven claims, each citing the sentence it reads, at
`2a2da8a`. It reports seven `fact-conflict` findings and four `claim-conflict` findings, and the `buildError` mention at
`guides/CHARTER.md:201` is a `dangling-reference`. One claim, the 23 jobs of GATE-01, is `unknown`: no fact holds the
jobs. All eleven are candidates and reach `csh queue`.

## Built

- `kernel`, `csl` and `arch`: the rule form `claim`, with nine propositions, and `evaluateClaim` and `claimConflict`, which look claims up in the facts and never call the solver ([A-104](../../ASSUMPTIONS.md)).
- `check`: the findings `fact-conflict` (a claim the code refutes, `violated`) and `claim-conflict` (two claims that cannot both hold, both `conflicting`) ([A-105](../../ASSUMPTIONS.md)).
- `adapter-items` and `check`: `mentions-symbol` and `mentions-script` edges, read from prose mechanically and resolved by trace against the facts ([A-106](../../ASSUMPTIONS.md)).
- `component`, `run` and `agent`: proposed claims in `csh/claims.json`, joined into their intents as candidates, and the ninth agent tool, `propose_claim`, which writes only that file ([A-107](../../ASSUMPTIONS.md)).
- `witness`, `facts` and `facts-ts`: the `declare` fact, for top-level declarations with a class's base and a literal constant's value. Any JSON file but a lockfile is read whole ([A-108](../../ASSUMPTIONS.md)).
- `component`: a manifest source with the same name, kind and place as a specification's only narrows it, so a claim can cite a source whose globs the manifest holds.
- `subjects/esi-ts`: the intent `ProseAboutCode` with eleven claims, and two more files in the `Code` source: `etc/doc-metrics.json` and `scripts/spec/check-spec-drift.ts`.

## What ESI.ts revealed

| Row | Claims | Reported |
|---|---|---|
| 1 | `CHARTER.md:190` and `ARCHITECTURE.md:941` say `CircuitOpenError` is not an `EsiError`; `ERRORS.md:74` says it is | Two `claim-conflict` findings, and two `fact-conflict` findings: `src/core/util/error.ts:155` declares it extending `EsiError` |
| 2 | `CHARTER.md:201` says `buildError` in `src/core/util/error.ts` builds the plumbing errors | `dangling-reference`: the module declares and exports no `buildError` |
| 3 | ARCH-05 says six entry points; ARCH-06's reason says seven | `claim-conflict`, and `fact-conflict` for six: `package.json` has seven, less `./package.json` |
| 4 | ARCH-07's reason says `isCircuitOpen` is missing from `./errors` | `fact-conflict`: `src/errors.ts` exports it |
| 7 | The tier table says 192 unit files; GATE-01 says 23 jobs | `fact-conflict` for 192, since `etc/doc-metrics.json` holds 223 unit suites; the jobs claim is `unknown`, since no fact holds them |
| 8 | One compatibility date | `fact-conflict`: `src/core/constants.ts:4` and `scripts/spec/check-spec-drift.ts:20` hold different dates |
| 11 | `SECURITY.md:132` says `.github/CODEOWNERS` is in place; issue `esi-wze` still asks for it | `claim-conflict`, and `fact-conflict` for the issue: the file is tracked |

Of the 451 symbol and script mentions the guides make, 450 resolve. Three that did not at first were patterns
(a script name with a placeholder, such as `npm run test:<name>`), which the adapter now leaves out.

## What proved wrong or costly in the documents

- Row 8 is a contradiction between two places in the code, not between two documents, so it is a `fact-conflict` on one claim that the two constants are equal. The plan said `claim-conflict`.
- Row 7's job count needs a fact about workflows, which nothing reads yet. The claim is kept as an atom, `unknown` with its reason, so it is listed and not lost.
- A pair of claims in conflict makes both `conflicting`, including the one the code bears out: whether `ERRORS.md` or the charter is right is the maintainer's call, even when the code agrees with one of them.
- To cite the guides and the issues, the specification must declare them. Since the manifest already declared them with globs, a declaration in both places had to become narrowing rather than `duplicate-source`.
- `fieldsOf(json, undefined)` took the parameter's default, so other JSON files were filtered like `package.json`. A test caught it, and the sentinel is now `null`.

## Effort

About 650 lines of source and 330 lines of tests. Effort was not timed.
