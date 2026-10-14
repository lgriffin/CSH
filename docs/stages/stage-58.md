# Stage 58: Polyglot containers

**Exit:** F170 to F173. A Maven module, a Go module, a cargo crate and a Python distribution are packages, so
`container(...)` and `closed` rules, the undrawn dependency and the unplaced package reach Java, Go, Rust and Python
as they reach an npm workspace ([16](../spec/16-analyse-danger-grain.md), section 5).

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 58. Every subject in CI meets its expected results unchanged: each
reads at most one package in its `Code` source (spring-hexagonal-poc builds with Gradle, which is not read), and a
source with one writes no package fact (Q-56).

## Built

- `facts-code` (`packages`): after every reader has run, a `package` fact per manifest that builds something, and
  `depends` facts between packages, by import (a file of one importing a file of the other, or a Go module path or a
  crate name) and by manifest ([A-199](../../ASSUMPTIONS.md)). Written as tool `facts-code`; npm packages still come
  from the `facts-imports` harness.
- `run` (`propose`): `go.work` is a manifest, read at any depth as the others have been since stage 55.
- [Q-56](../../QUESTIONS.md) records the one choice the fixtures could not settle: a repository that builds one
  package writes no package fact.

## What the fixtures and the subjects revealed

- The four fixtures passed on the first run of the code. Before it, each rule over a container was unknown,
  `selects-nothing`, since no package was read; `closed` held vacuously, as there was no dependency between packages to
  draw.
- No subject in CI reads two packages in one `Code` source. Writing a lone package's fact would have added an
  `unplaced-package` gap to each subject whose diagram places directories; hence Q-56.

## Not done

- Gradle builds (Kotlin and Groovy DSL), `setup.cfg`, `setup.py`, `requirements.txt` and `module-info.java` declare no
  package; they are the spec's manifests row, which no stage of the six names.
- A Python import resolves to a distribution's files only when its `src` layout or package parent is a source root.
