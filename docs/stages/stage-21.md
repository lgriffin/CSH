# Stage 21: Subject profiles and runs without a model

**Exit:** `csh run` on ESI.ts writes a stored run under `subjects/esi-ts/` with no file in ESI.ts changed, and every
existing fixture still passes ([11](../spec/11-ingesting-a-codebase.md)).

**Status:** exit reached. `csh subject fetch --root subjects/esi-ts` clones ESI.ts at `2a2da8a`. `csh run --root subjects/esi-ts` then stores a run in about a second, and the subject's checkout stays clean.

## Built

- `component`: `csh-component/v2`. A manifest may name a `subject`, leave out `spec`, and declare its `sources` itself. `moduleOfManifest` gives the model of a component with no specification ([A-93](../../ASSUMPTIONS.md)). A harness on a subject is refused.
- `run`:
    - `loadProject` finds and checks the subject's checkout, and `fetchSubject` makes one ([A-92](../../ASSUMPTIONS.md)).
    - Sources are read from `Project.sourceRoot`. A practice's own adapter and step table are still read from the component root (`codeRoot`).
    - The snapshot and the report carry `subject` ([A-94](../../ASSUMPTIONS.md)).
    - `specPathOf` replaces `specOf` wherever a specification may be absent.
- `cli`: `csh subject fetch` and `--subject <dir>`. `csh run` prints the subject, and the counts of items, unliftable content and adapter diagnostics.
- `review`: `csh diff` reads a manifest with no `spec`, and no longer says `spec-untouched` where there is none.
- `adapter-ears-markdown`: a file that yields nothing is the warning `no-items` ([A-95](../../ASSUMPTIONS.md)).
- `subjects/esi-ts`: the first subject profile. It holds one practice, the charter.

## What ESI.ts revealed

The first run reported zero findings, zero gaps and zero items. It also reported no diagnostic, so it read as clean. The charter's 66 requirements are written as `#### ARCH-01 · Ubiquitous · Enforced` headings, and the EARS adapter skipped every such line without a word. That silence broke P4, and it is the reason for `no-items`. The run now says: items 0, one warning. Reading the charter is stage 22's work, and until then that zero is the stage's honest result.

## Effort

About 300 lines of source and 150 lines of tests. Effort was not timed.

## What proved wrong or costly in the documents

- D7 and section 2 of [the main tab](../spec/00-main.md) put profiles for named repositories out of scope. [11](../spec/11-ingesting-a-codebase.md) amends both.
- Fixtures are laid into one scratch repository each, and a subject needs a second repository. The stage is covered by package tests (`packages/run/test/subject.test.ts`, `packages/component/test/manifest.test.ts`) rather than new fixtures.
