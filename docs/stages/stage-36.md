# Stage 36: Polyglot profiles

**Exit:** one pinned public subject per language, Python, Java, Go and Rust, is evaluated by a profile whose rules
and claims state what the subject's own documents say about its layering, and CI runs each profile
([12](../spec/12-polyglot-code.md), section 5).

**Status:** exit reached. Four profiles, each pinned to a full commit of an MIT-licensed repository, are run by the CI
job `Subject (<name>)`, one per profile in a matrix beside `Subject (ESI.ts)`. Each job fetches its subject at the pin,
which fails the job when the fetch fails, runs the profile, and compares it with its committed expected results. At the
pins, `csh expect` finds every expectation of all four met: 43 obligations, 41 as expected converged, one expected
violation and one expected unknown.

| Language | Profile | Subject | Pinned commit | Rules | Claims | Converged | Gap | Indeterminate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Python | [`subjects/fastapi-clean-example`](../../subjects/fastapi-clean-example) | [ivan-borovets/fastapi-clean-example](https://github.com/ivan-borovets/fastapi-clean-example), branch `legacy-2025` | `58ef7f6` | 7 | 8 | 15 | 0 | 0 |
| Java | [`subjects/spring-hexagonal-poc`](../../subjects/spring-hexagonal-poc) | [rbiedrawa/spring-hexagonal-architecture-poc](https://github.com/rbiedrawa/spring-hexagonal-architecture-poc) | `db76d00` | 4 | 3 | 5 | 1 | 1 |
| Go | [`subjects/go-clean-arch`](../../subjects/go-clean-arch) | [bxcodec/go-clean-arch](https://github.com/bxcodec/go-clean-arch) | `e06c6d0` | 5 | 5 | 10 | 0 | 0 |
| Rust | [`subjects/hexarch`](../../subjects/hexarch) | [howtocodeit/hexarch](https://github.com/howtocodeit/hexarch), branch `3-simple-service` | `d58a5c6` | 5 | 6 | 11 | 0 | 0 |

## Built

- Four subject profiles, each with a `csh-component/v2` manifest naming a `Docs` source (the subject's README), a
  `TestFiles` source and a `Code` source, a specification of module rules (`forbid` and `only` over `modules`) and
  structural claims, and `csh/expected.json`. Each rule and claim cites the README as a `Documents` item, and names in a
  comment the heading and lines it reads, as the ESI.ts profile does for text with no identifier; hexarch's claims
  about its doc comments cite nothing, since no source reads a doc comment.
- The expected results were written from each subject's documents, and from a reading of its source by hand, before CSH
  was run on any subject, and committed alone first (`76b4a93`). No expectation was changed after a run.
- The expected files give rows and no counts: a count of each outcome cannot be derived from a subject's documents
  before a run, and one recorded after it would be an expectation written from output. This is [A-135](../../ASSUMPTIONS.md).
- CI: the job `polyglot`, a matrix over the four profiles, with the steps of `Subject (ESI.ts)` but the A3. The ESI.ts
  job is unchanged.
- A README per subject, in the shape of [subjects/esi-ts](../../subjects/esi-ts/README.md).

No code changed: every reader read its subject without a fault this stage could find.

## What the subjects revealed

- **The Java subject's Readme and its code disagree on what the core depends on.** The Readme says `business` has no
  external dependencies. Read strictly, as a rule that it imports only itself and `java.*`, it is `violated`: its
  services and models import `org.springframework.stereotype`, `org.springframework.util`,
  `org.springframework.core.annotation` and Lombok. Read as "no adapter", it holds (`BusinessImportsNoAdapter`). The
  profile expects both results, so the disagreement is reported, not hidden; which reading the author meant is a
  question.
- **A Gradle build says nothing CSH reads.** The Java subject's Readme gives Java 11, and `build.gradle` holds it, but no
  reader reads Gradle files, so the claim is `unknown` with `not-read: build.gradle`, as expected. Maven's `pom.xml` would
  have been read.
- **An import of generated code reads as an external package.** The Java subject's GraphQL adapter imports types
  that its build generates (`com.rbiedrawa.hexagonal.app.api.graphql.gen`). No file declares them, so A-131 names the
  package as an external one. No rule here constrains that adapter's dependencies; a rule that allowed it only the
  project's own modules would count generated code as external.
- **The Python subject states its layers twice, and the two differ.** The README's revised Dependency Rule constrains
  only the core (domain and application); the import-linter contract in `pyproject.toml` orders every layer, so
  infrastructure may not import presentation. The profile follows the contract, the stricter and machine-checked
  statement, and both hold. The contract's one ignored import, the Alembic environment importing the settings, is a rule
  of its own.
- **Every rule holds where its subject's maintainers check it, and where they do not.** The Python subject runs
  import-linter in CI, so its five layering rules holding is no surprise; its interactors not importing one another, and
  the core importing no framework, are checked by nothing in the subject and hold too. go-clean-arch and hexarch check
  nothing of their layering, and every rule holds.
- **Rust documents its architecture in doc comments.** hexarch's README says one line about the design; the ports,
  their purpose and the opacity of the HTTP package are stated in `///` comments. A claim can give such a line as its
  `at`, but a `Documents` source reads only Markdown, so the rules cite the README and name the doc comment's line in a
  comment, and the claims taken from doc comments cite nothing rather than a README that does not say them (review of
  #65).
- **The polyglot test inventory agrees with a count by hand** on every file checked: pytest 77 tests in 15 files, JUnit
  19 in 8, Go 18 in 5, and hexarch's one `#[tokio::test(flavor = "multi_thread")]`. No subject commits results, so no
  outcome is joined and no test cites a requirement: none of the four uses requirement identifiers.

## What proved wrong or costly in the documents

- The candidates the brief named did not all qualify. `cosmicpython/code` is CC-BY-ND, and `thombergs/buckpal` has no
  licence at all, so neither may be used; the Python and Java subjects were replaced by MIT-licensed ones whose
  documents state their layering.
- [A-125](../../ASSUMPTIONS.md) says a profile's expected results include counts, and rule 4 of the implementer's brief
  says an expected result comes from the documents, never from a run. For ESI.ts the counts were recorded from runs. A
  new profile cannot have both, and these leave counts out.
- Rule 4 also leaves open how a disagreement between a subject's documents and its code is expected. Expecting what the
  documents say would make CSH's correct report a failed CI job. These profiles expect what CSH should report of the
  code, decided before any run from the documents and a reading of the source by hand: the Java core's dependencies are
  expected `violated`, as the ESI.ts profile expects its known contradictions as gaps.
- The go-clean-arch README names the layers of its first version, models, repository, usecase and delivery, while the
  code has the layout of its fourth; which directory is which layer is the profile's reading, recorded in its
  specification.
- hexarch's README calls `Service` a trait; in the code `Service` is the struct that implements the trait `BlogService`.
  No claim can say which, since claims name declarations and not their kinds, so this is listed as unknown.

## What remains

- No subject's tests are run, so no `csh/results.json` is committed and no outcome is joined; each would need the
  subject's toolchain once per pin, as ESI.ts's did.
- A `Documents` source reads only Markdown, so a design stated in doc comments (Rust's `///`, Java's `package-info.java`)
  is not an item a rule can cite.
- Gradle build files are not read.

## Effort

About 850 lines of profiles, expected results and READMEs, 100 of this note and 30 of CI. No source or test code changed. Effort
was not timed.
