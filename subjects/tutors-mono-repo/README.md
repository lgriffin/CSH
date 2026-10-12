# tutors-mono-repo, a subject profile

This directory evaluates https://github.com/tutors-sdk/tutors-mono-repo from outside, pinned to `ee66461` (main, 369 commits after `v16.2.2`). The repository is only read; nothing is written to it, and only identifiers, paths, spans, commits, digests and counts from it are committed here, never its text ([11](../../docs/spec/11-ingesting-a-codebase.md)).

```
node packages/cli/bin/csh.js subject fetch --root subjects/tutors-mono-repo   # clone it at the pinned commit
node packages/cli/bin/csh.js run --root subjects/tutors-mono-repo             # evaluate it
node packages/cli/bin/csh.js overview --root subjects/tutors-mono-repo        # converged, gaps and indeterminate
node packages/cli/bin/csh.js expect --root subjects/tutors-mono-repo          # compare with the expected results
```

The test results are committed as [`csh/results.json`](csh/results.json): each test file's path and counts, and the identifiers its tests cite, at the pinned commit, with no test name. To make it again, run the repository's unit configuration in a git clone of the checkout, outside this repository, and reduce the report:

```
git clone --config core.autocrlf=false .csh-cache/subjects/<commit> /tmp/tmono && cd /tmp/tmono
pnpm install --frozen-lockfile --ignore-scripts
for a in reader catalogue live time; do (cd apps/$a && npx svelte-kit sync); done   # the apps' generated tsconfig files
npx vitest run --reporter=json --outputFile=<this directory>/results/vitest.json
node packages/cli/bin/csh.js results import tdd subjects/tutors-mono-repo/results/vitest.json --base /tmp/tmono --root subjects/tutors-mono-repo
```

With `svelte-kit sync` skipped, about 70 tests fail on a missing tsconfig. A clone that converts line endings fails two Dockerfile checks. The whole run takes under a minute. The clone, the runner's report and the history stages stay under `.csh-cache/`, `results/` and `csh/a3/*/stages/`, which git ignores.

## What it reads

| Practice | Source | Result at `ee66461` |
| --- | --- | --- |
| Specifications | `guides/specifications` | 18 documents (read as references, since their headings carry no identifier) |
| Guides | `guides/*.md`, `guides/testing`, `guides/evolution`, `ARCHITECTURE.md`, `README.md`, `CHANGELOG.md` | 14 guides and 3 root documents; 8 `dangling-reference` gaps, each naming a file that is not tracked or was deleted |
| BDD | `tests/bdd/features`, with `idTag` `rule-([0-9]+)` | 43 features, 159 rules (each keeps its `@rule-NNNN` tag as its identifier, `0270` and so on) and 306 scenarios; 9 rules match no EARS pattern (`no-pattern`) |
| Tests | `tests/**/*.test.ts` and `*.steps.ts`, `apps/**/tests/e2e/*.spec.ts`, with `citePattern` `Rule NNNN` and `cites` Features | 167 test files, 12 Playwright specs |
| Test results | `csh/results.json`, from `vitest run` in a scratch clone | 3,162 tests in 161 files: 3,160 passed, 2 failed (`release-quality.test.ts`, which spawns `pnpm` without a shell and fails on Windows). 6 tests cite a rule in their name; they bear out rules 0031 and 0269 (`tested`, converged). The 12 specs and 6 other test files have no result (`results-missing`) |
| Code facts | `apps` and `packages`, `.ts` and `.svelte`, every `package.json` and `deno.json`, without test directories | 395 modules, 1,258 dependencies, 832 exports, 1,709 declarations and 259 manifest fields; `@tutors/*` imports resolve to modules |
| Layering | [`csh/spec.csl.ts`](csh/spec.csl.ts), the intent `Layering`: 14 rules over modules | 12 `satisfied`, 2 `violated` (see below) |
| Claims | [`csh/spec.csl.ts`](csh/spec.csl.ts), the intent `ProseAboutCode`: 30 claims, each citing a line | 17 hold, 11 `fact-conflict` and 4 `claim-conflict` |
| History | `history.since` the previous tag (`v16.2.2`), `frozen` the changelog and `guides/evolution`, `tests` also the features, steps and specs | 48 `untraced-change` (commits since `v16.2.2` that change `apps` or `packages` with no test and no `Refs:` trailer), 26 documents with a line older than a file it names (`stale-prose`), and 6 refuted claims older than the code that refutes them |
| Releases | `csh history releases --from v16.1.4 --to v16.2.2` | One A3 stage per release, 7 in all, kept under `csh/a3/releases/`, which git ignores. The table below is from it |
| Expected results | [`csh/expected.json`](csh/expected.json), compared by `csh expect` | 106 gaps, 2 indeterminate and 31 converged; ten rows, each reported, rows 1 and 9 with parts unknown and the reason (below) |

## Layering

Each rule says in CSL what a line of the repository says, and cites it in a comment; every rule is a candidate until a maintainer approves it.

| Rule | Source of the statement | Result |
| --- | --- | --- |
| `FoundationImportsNoHigherLayer`, `CoreImportsNoHigherLayer`, `FeatureImportsNoUiOrApp`, `PrimitivesImportNoNavigatorComponentOrApp`, `NavigatorsImportNoComponentOrApp`, `ComponentsImportNoApp` | `.dependency-cruiser.cjs:14-53` (the layers, lowest first), `README.md:191-199`, `ARCHITECTURE.md:114` | `CoreImportsNoHigherLayer` violated by `course/.../lo-tree.ts` importing `themes`; the other five satisfied |
| `PrimitivesTakeDataAsProps` | `.dependency-cruiser.cjs:94-100`, `ui-primitives-no-data-features` | violated by 3 edges: `LoContextTree.svelte` and `LoContextTreeView.svelte` import `rbac`, `StudentCard.svelte` imports `community` for a type |
| `ReaderImportsNoOtherApp`, and one each for catalogue, live and time | `.dependency-cruiser.cjs:79-85`, `no-app-to-app` | satisfied |
| `OnlyIdentityAdapterImportsAuthProviders` | `.dependency-cruiser.cjs:58-64`, `README.md:201` | satisfied; with the exception removed it finds 3 imports, all in `identity-sveltekit` |
| `IdentityContractsAreSelfContained` | `.dependency-cruiser.cjs:65-71` | satisfied (the package is one file that imports nothing) |
| `SharedTypesImportNothingOutside` | `.dependency-cruiser.cjs:102-108`, Rule 0130 (cited as the rule `0130`) | satisfied; 12 imports inside the package, none outside |

The repository checks the same layers with dependency-cruiser and baselines its known violations in `tests/architecture/known-violations.txt`. That file lists three of the four edges CSH finds. The fourth, `StudentCard.svelte` importing a type from `community`, is one `guides/SHARED-TYPES.md` names as a problem itself; dependency-cruiser does not see it.

## The rows

| Row | Reported as | Unknown, with the reason |
| --- | --- | --- |
| 1 | 12 layering rules `satisfied` | `no-cross-workspace-relative-import`, `no-cross-package-cycle` and `identity-no-server-in-browser` have no builder: `modules()` selects files by name and reads direct imports, so it cannot tell a relative import from a package import, state a cycle, or follow reachability |
| 2 | 2 layering rules `violated` | |
| 3 | 17 claims `satisfied`: versions, floors, files, scripts, exports, an `inherits` | |
| 4 | 11 `fact-conflict`: the release strategy's version 15.2.0, the changelog's 16.2.0 for three apps, a missing `ears-audit.config.json` and `fetch-migrations.sh`, and the rest | |
| 5 | 4 `claim-conflict`: Node 18 against Node 22.12, and 5, 7 and 8 JSR packages | |
| 6 | 6 `stale-prose`: refuted claims written before the code that refutes them took its value | |
| 7 | 8 `dangling-reference` | |
| 8 | 26 `stale-prose` on documents | |
| 9 | 2 `tested`, 1 `failing-test`, 2 `results-missing` | The 12 Playwright specs name their rule in `tag: "@rule-NNNN"`, which the tests adapter does not read; steps files and features are joined by name only |
| 10 | 48 `untraced-change` | |

## History

`csh history` ran the profile at each release tag from `v16.1.4` to `v16.2.2`. The rules and claims are the same at every tag, so what moves is the repository:

| Release | Commit | Items | `stale-prose` | `untraced-change` | `dangling-reference` | Obligations satisfied / violated / conflicting / unknown |
| --- | --- | --- | --- | --- | --- | --- |
| v16.1.4 | `7876ca2` | 256 | 12 | 103 | 1 | 17 / 20 / 5 / 2 |
| v16.1.5 | `e65fe9f` | 257 | 11 | 9 | 1 | 17 / 20 / 5 / 2 |
| v16.1.6 | `f4e3782` | 258 | 12 | 2 | 1 | 17 / 20 / 5 / 2 |
| v16.1.8 | `de4edb8` | 258 | 11 | 8 | 1 | 17 / 20 / 5 / 2 |
| v16.2.0 | `8167348` | 262 | 10 | 4 | 1 | 20 / 17 / 5 / 2 |
| v16.2.1 | `c291532` | 288 | 13 | 5 | 1 | 24 / 13 / 5 / 2 |
| v16.2.2 | `caa53d0` | 289 | 13 | 2 | 0 | 25 / 12 / 5 / 2 |

The last column counts every obligation, the layering rules and the claims together. Violations fall as the repository gains the files its guides name, such as the identity adapter and the Playwright specs.

## What CSH cannot do here

- A tag option such as `{ tag: "@rule-0051" }` on a Playwright test cites nothing, because the tests adapter reads titles only (`packages/adapter-items/src/tests.ts`, `declarations`). The 12 specs would cite the rules their tags name.
- Nothing joins a steps file to the feature it loads (`loadFeature("tests/bdd/features/...")`). The Gherkin adapter has no step table and the tests adapter does not read that call (`packages/adapter-items/src/gherkin.ts`).
- Counts in `pnpm-workspace.yaml` or in prose such as "21 Node-level feature files" have no fact: `facts-ts` reads JSON, not YAML, and no claim counts files.
- `no-cross-package-cycle`, `no-cross-workspace-relative-import` and `identity-no-server-in-browser` are not expressible as architecture rules.
