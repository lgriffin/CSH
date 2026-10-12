# go-clean-arch, a subject profile

This directory evaluates [go-clean-arch](https://github.com/bxcodec/go-clean-arch) from outside: a widely copied
example of Clean Architecture in Go, whose README states Uncle Bob's rules, names its layers and records how its layout
changed from v1 to v4. It is the Go profile of stage 36 ([12](../../docs/spec/12-polyglot-code.md), section 5). The
profile is pinned to commit `e06c6d0cb37069b0ef56e3df67f80ca130a1ab82`, the head of its default branch (v4). The
subject is only read; nothing is written to it ([11](../../docs/spec/11-ingesting-a-codebase.md)).

```
node packages/cli/bin/csh.js subject fetch --root subjects/go-clean-arch   # clone it at the pinned commit
node packages/cli/bin/csh.js run --root subjects/go-clean-arch             # evaluate it
node packages/cli/bin/csh.js expect --root subjects/go-clean-arch          # compare with the expected results
```

go-clean-arch is MIT-licensed. CSH commits from it what it commits from ESI.ts and no more: identifiers, paths, spans
and commits, never its text ([#37](https://github.com/lgriffin/CSH/issues/37)). The checkout and the run reports stay
under this directory's `.csh-cache/` and `reports/`, which git ignores.

The expected results are [`csh/expected.json`](csh/expected.json), written from the README, and from a reading of the
source by hand, before CSH was first run on the subject. CI runs the profile in the job `Subject (go-clean-arch)`.

## What it reads

| Source | Kind | At | Read at `e06c6d0` |
| --- | --- | --- | --- |
| Docs | Documents | `**/*.md` | 3 documents |
| Tests | TestFiles | `**/*_test.go` | 5 files, 18 tests |
| Code | Code | `**/*.go` but tests, and `go.mod` | 14 modules, 68 dependencies, 69 declarations, 58 exports and 49 fields of `go.mod`, none skipped |

## The rules and claims

The README names four layers, models, repository, usecase and delivery, but not their directories, which changed in
v4. The profile reads models as `domain`, usecase as the service package `article`, repository as `internal/repository`
and delivery as `internal/rest`. The specification, [`csh/spec.csl.ts`](csh/spec.csl.ts), cites the README for each
rule, with the lines it reads in a comment.

| Rule or claim | Says | Expected | At `e06c6d0` |
| --- | --- | --- | --- |
| `ModelsKnowNothingOutside` | The models import only the standard library | satisfied | satisfied |
| `UsecaseImportsNoOuterLayer`, `UsecaseImportsNoFrameworkOrDatabase` | The usecase imports no delivery, repository or composition package, no web framework and no database driver | satisfied | satisfied |
| `DeliveryImportsNoRepository`, `RepositoryImportsNoDelivery` | Delivery and repository meet only through the usecase | satisfied | satisfied |
| `ServiceDeclaresTheRepositoryInterface`, `DeliveryDeclaresTheServiceInterface`, `ModelsDeclareNoRepositoryInterface` | Interfaces are declared on the consuming side (the v4 changelog) | satisfied | satisfied |
| `SchemaFileExists`, `ExampleEnvExists` | The files the instructions name exist | satisfied | satisfied |

Whether a logging or concurrency library is a framework the usecase must not depend on stays unknown, with its reason,
in the expected results.
