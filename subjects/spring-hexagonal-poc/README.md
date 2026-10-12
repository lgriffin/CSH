# spring-hexagonal-architecture-poc, a subject profile

This directory evaluates [spring-hexagonal-architecture-poc](https://github.com/rbiedrawa/spring-hexagonal-architecture-poc)
from outside: a Spring Boot order service laid out as ports and adapters, whose Readme names the packages and what
each holds. It is the Java profile of stage 36 ([12](../../docs/spec/12-polyglot-code.md), section 5). The profile is
pinned to commit `db76d0042699b3b83e0f47782ab7f7a56ee16cee`, the head of its default branch. The subject is only read;
nothing is written to it ([11](../../docs/spec/11-ingesting-a-codebase.md)).

```
node packages/cli/bin/csh.js subject fetch --root subjects/spring-hexagonal-poc   # clone it at the pinned commit
node packages/cli/bin/csh.js run --root subjects/spring-hexagonal-poc             # evaluate it
node packages/cli/bin/csh.js expect --root subjects/spring-hexagonal-poc          # compare with the expected results
```

spring-hexagonal-architecture-poc is MIT-licensed. CSH commits from it what it commits from ESI.ts and no more:
identifiers, paths, spans and commits, never its text ([#37](https://github.com/lgriffin/CSH/issues/37)). The checkout
and the run reports stay under this directory's `.csh-cache/` and `reports/`, which git ignores.

The expected results are [`csh/expected.json`](csh/expected.json), written from the Readme, and from a reading of the
source by hand, before CSH was first run on the subject. CI runs the profile in the job
`Subject (spring-hexagonal-poc)`.

## What it reads

| Source | Kind | At | Read at `db76d00` |
| --- | --- | --- | --- |
| Docs | Documents | `Readme.md` | 1 document |
| Tests | TestFiles | `src/test/java/**/*.java` | 8 files, 19 JUnit tests |
| Code | Code | `src/main/java/**/*.java` | 35 modules, 195 dependencies, 38 declarations and 21 exports, none skipped. The build is Gradle, which no reader reads, so there are no manifest fields |

## The rules and claims

The Readme states the pattern under "Ports & Adapters Pattern" and the packages under "Project package structure":
`api` holds the driving adapters, `spi` the driven adapters, and `business` the core. The specification,
[`csh/spec.csl.ts`](csh/spec.csl.ts), states them as module rules, each citing the Readme, with the lines it reads in
a comment.

| Rule or claim | Says | Expected | At `db76d00` |
| --- | --- | --- | --- |
| `BusinessImportsNoAdapter` | The core imports no adapter, configuration or entry point | satisfied | satisfied |
| `BusinessHasNoExternalDependency` | The core imports only itself and `java.*`, as the Readme says it has no external dependencies | violated | violated: services and models import `org.springframework.*` (stereotype, util, core annotations) and Lombok |
| `PrimaryAdaptersImportNoSecondaryAdapter`, `SecondaryAdaptersImportNoPrimaryAdapter` | Driving and driven adapters reach each other only through the core | satisfied | satisfied |
| `JavaElevenIsTheTarget` | The build targets the Java version the Readme gives | unknown | unknown: `not-read: build.gradle` |
| `ComposeFileExists`, `LicenceFileExists` | The files the Readme points to exist | satisfied | satisfied |

`BusinessHasNoExternalDependency` reads the Readme strictly. Its line may mean only that the core depends on no
adapter, which `BusinessImportsNoAdapter` checks and which holds; which reading the author meant is a question for the
owner of this profile, not a fault CSH can settle.
