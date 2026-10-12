# fastapi-clean-example, a subject profile

This directory evaluates [fastapi-clean-example](https://github.com/ivan-borovets/fastapi-clean-example) from outside: a
FastAPI backend laid out in the layers of Clean Architecture, with its own account of them in its README. It is the Python
profile of stage 36 ([12](../../docs/spec/12-polyglot-code.md), section 5). The profile is pinned to commit
`58ef7f61a83028f9404278ca9b2dcb21df497591`, the head of the branch `legacy-2025`, where the README's architecture
sections live; the main branch's README was cut back to a stub while the project is refactored. The subject is only
read; nothing is written to it ([11](../../docs/spec/11-ingesting-a-codebase.md)).

```
node packages/cli/bin/csh.js subject fetch --root subjects/fastapi-clean-example   # clone it at the pinned commit
node packages/cli/bin/csh.js run --root subjects/fastapi-clean-example             # evaluate it
node packages/cli/bin/csh.js expect --root subjects/fastapi-clean-example          # compare with the expected results
```

fastapi-clean-example is MIT-licensed. CSH commits from it what it commits from ESI.ts and no more: identifiers, paths,
spans and commits, never its text ([#37](https://github.com/lgriffin/CSH/issues/37)). The checkout and the run reports
stay under this directory's `.csh-cache/` and `reports/`, which git ignores.

The expected results are [`csh/expected.json`](csh/expected.json), written from the README and `pyproject.toml`, and
from a reading of the source by hand, before CSH was first run on the subject. CI runs the profile in the job
`Subject (fastapi-clean-example)`.

## What it reads

| Source | Kind | At | Read at `58ef7f6` |
| --- | --- | --- | --- |
| Docs | Documents | `README.md` | 1 document |
| Tests | TestFiles | `tests/**/*.py` | 41 files, 15 holding tests, 77 tests as pytest collects them; 26 files (packages, fixtures, factories) hold none |
| Code | Code | `src/**/*.py`, `pyproject.toml` | 152 modules, 686 dependencies, 240 declarations, 233 exports and 23 manifest fields, none skipped |

## The rules and claims

The README states the layers under "Layered Approach" and the Dependency Rule under "Dependency Rule" and "Note on
Adapters", and `pyproject.toml` states their order as an import-linter contract (`clean-architecture`, from `run` down
to `domain`). The specification, [`csh/spec.csl.ts`](csh/spec.csl.ts), states them as module rules, each citing the
README, with the lines it reads in a comment.

| Rule or claim | Says | Expected | At `58ef7f6` |
| --- | --- | --- | --- |
| `DomainImportsNoOuterLayer` | The domain imports no outer layer | satisfied | satisfied |
| `ApplicationImportsNoOuterLayer` | The application imports no infrastructure, presentation or composition module | satisfied | satisfied |
| `InfrastructureImportsNoOuterLayer`, `AlembicEnvImportsOnlyTheSettings` | Infrastructure imports neither presentation nor composition, but for the one import the contract ignores | satisfied | satisfied |
| `PresentationImportsNoComposition` | Presentation imports neither `setup` nor `run.py` | satisfied | satisfied |
| `CoreImportsNoFrameworkOrDriver` | Domain and application import none of the frameworks and drivers the Technology Stack lists | satisfied | satisfied |
| `InteractorsDoNotCallEachOther` | No interactor or query service imports another | satisfied | satisfied |
| `UsernameTakenIsDeclaredInTheDomain`, `UsernameTakenIsAnException` | The exception the README names is a domain exception | satisfied | satisfied |
| Six `...Exists` claims | The files the README's structure tree names exist | satisfied | satisfied |

What stays unknown, with its reason, is listed in the expected results: a library outside the named frameworks that
binds the core to an implementation detail, and an interactor called through an injected object rather than an import.
