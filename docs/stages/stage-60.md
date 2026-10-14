# Stage 60: Calibrate and ship

**Exit:** five subjects, one per language (fastapi-clean-example, spring-hexagonal-poc, go-clean-arch, hexarch and the
taskboard repository), each read cold by `csh analyse` and compared with its `analysis-expected.json` in CI, with no
false gap among what they report; a tagged tarball release and an Action; and the docs reconciled with what the
fixtures prove ([16](../spec/16-analyse-danger-grain.md), section 6).

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 60. Every subject in CI meets its expected results, through its
profile and cold. Every `sh` block of the README runs in CI, as it has since the README's commands were first
checked (`node packages/testkit/src/triangle.ts readme`); this stage adds none that needs the network.

## Built

- `adapter-items` (`told`): a layering sentence is lifted only when its restricting word stands beside the dependency
  phrase, and never when it hedges or asks ([A-203](../../ASSUMPTIONS.md)).
- `run` (`analyse`) and `cli` (`analyse`): `--expected <file>` compares any analysis, cold or through a profile, with a
  `csh-expected/v1` file, and exits 1 when it does not meet it.
- `subjects/<name>/analysis-expected.json` for the five subjects: every entry of the cold read as a row, and the
  counts, so that a new entry fails the job until it is shown to be true. CI's `Analyse the subject cold` step reads it.
- `.github/workflows/release.yml`: on a tag `v*`, every package packed, the bundle installed into an empty directory
  and `csh analyse` run from it, then the bundle and the tarballs attached to the tag's release.
- `action.yml`: `csh analyse` as an Action, run from its own source; CI's job `Action` uses it on go-clean-arch cold.
- [ADR-32](../adr/ADR-32-local-only-distribution.md) revisited; [Q-51](../../QUESTIONS.md) built as proposed.
- Docs reconciled: the README's Limits (test outcomes from every runner read, told rules a reading), the architecture
  rules guide's Limits (`inherits` over every supertype), the `facts-code` README on Java nested types (declared, as
  A-170 says), and [12](../spec/12-polyglot-code.md), section 3, on Go local imports, `go.work` and supertypes.

## What the calibration revealed

The first cold reads lifted 4 told rules from fastapi-clean-example, 7 from go-clean-arch, 2 from the taskboard
repository, none from spring-hexagonal-poc or hexarch, and 65 from ESI.ts. Each was read against its sentence:

- Three were false in the five subjects: a permission ("Components in any outer layer can depend on components in any
  inner layer, not necessarily the one closest to them"), a hedge ("based on imports, it might seem that the Dependency
  Rule isn't violated") and a sentence whose "not" restricts something else ("Imports therefore carry the `.ts`
  extension, … and `enum` and constructor parameter properties are not available"). A-203 removes them; each is now a
  unit test.
- In ESI.ts the same rule removes 23 of the 62 layering sentences, such as "An import of a sub-path the package's
  `exports` map does not list fails here" and sentences that name the `no-restricted-imports` rule, and adds two that
  "forbid" an import, both real ("`npm run lint:layers` … forbids core importing the layers above it"). Three real
  rules are lost, their restriction further from the dependency than the window reaches: "it imports `src/core`,
  `src/adapters` and `src/generated` and nothing legacy", "nothing under `src` outside `src/sde` may import it" and
  "Importing the package … constructs no logger". ESI.ts is not one of the five, and its profile does not lift told
  rules, so its expected results are unchanged.
- What stays is true of each subject: each lifted rule names no mechanism that checks it and no test cites it, so
  each is `unverified`; the taskboard repository names a results file it does not commit, so its outcomes are
  indeterminate. spring-hexagonal-poc and hexarch report nothing cold: neither states a layering rule in its prose.

The expected files were written from the cold reads after each entry was checked against the subject's source, not
before the code: they hold the calibration, while the fixtures of stages 55 to 59 hold the behaviour.

## Not done

- No tag is cut; cutting one is the owner's, and the release runs then.
- The Action installs from source with pnpm, so it needs no release but takes an install's time.
- Over-report per language is measured on one repository each; a larger corpus would measure it better.
