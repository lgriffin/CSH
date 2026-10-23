# Stage 62: What the Toads run asked for

**Exit:** fixtures F184 to F188, written from [18](../spec/18-from-the-toads-run.md) before the code. Every subject in
CI still meets its expected results and its `analysis-expected.json`. A cold read of lgriffin/toads at `6f7256e`
reports none of the false findings of [issue 87](https://github.com/lgriffin/CSH/issues/87). Every scenario it calls
bound or unbound agrees with pytest's collection.

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 62.

## Built

- `run`:
  - `sources` and `pipeline`: the untracked paths that prose names and the repository ignores are passed to the check
    (A-214).
  - `propose`:
    - An import-linter configuration joins each Markdown source (A-218).
    - A pytest-bdd test file sets `style: cucumber`, and every `conftest.py` is read for steps.
    - A Python file in a `steps` directory is a step file (A-217).
- `adapter-items`:
  - `pytest-bdd` reads a module's `scenarios()` and `@scenario` bindings (A-215) and its step definitions (A-217).
  - `import-linter` reads contracts, and `markdown` verifies a told rule that names one (A-218).
  - `told` leaves out quotations and data imports, and keeps a restriction in its clause (A-219).
- `check`:
  - `trace` leaves an ignored path unchecked (A-214).
  - `steps` decides each scenario's binding, as `stepless-scenario`, `unbound-scenario` or `binding-undecided` (A-216).
- [Q-60](../../QUESTIONS.md) and [Q-61](../../QUESTIONS.md) record the choices left open.

## What the run revealed

Before the stage, the cold read of Toads at `6f7256e` reported 18 gaps, 1 indeterminate and 0 converged, 10 of the
gaps refuted, and no told rule above L2. After it:

| | Before | After |
|---|---|---|
| Refuted danger | 10, all false: ignored files with tracked templates | 0 |
| Told rules | 8, 4 of them false (a quotation, two data imports, a "cannot" in another clause) | 4 |
| Told rules checked (L3) | 0 | 3, each by an import-linter contract in `pyproject.toml` |
| `unverified` | 8 | 1 (`docs/bank-desk.md:18`, tested but not cited, section 6 of 18) |
| `stepless-scenario` | not read | 22, the scenarios of lgriffin/toads#127 |
| `unbound-scenario` | not read | 21, each `@pending` with no steps |
| `binding-undecided` | not read | 73, in features bound by computed titles, REQ-HUB-CLAIM-006 (lgriffin/toads#128) among them |
| Step definitions read | 0 | 854, every one readable; no undefined step and no unused definition |

pytest 8 with pytest-bdd 8.1 collects 254 scenario tests from Toads at `6f7256e`. All 22 scenarios CSH reports as
`stepless-scenario` are among them, with no steps. None of the 21 `unbound-scenario` is collected. Of the 73
`binding-undecided`, pytest binds 52 and leaves out 21. No step is undefined, which agrees with the 254 tests passing.

No subject's expected results change, and the cold read of tutors-mono-repo at `1279669` is the same as stage 61's.
The prose-drift A3 of ESI.ts changes in seven stages, v10.0.0 to v10.2.3. ESI.ts ignores two generated directories:
`docs-site/public/api/`, the API reference TypeDoc writes, ignored in every release, and later `docs-site/guide/`,
which the site generator fills. Prose that names them, or a page in them, is no longer a dangling reference. At
v10.0.0 that removes the dangling reference of `guides/RELEASE.md` and shortens those of the charter and
`guides/QUALITY-GATES.md`. The A3 is rebuilt to match.

## After review

The review of the stage found bindings it misread, each now covered by a test, and F185 by a directory. A
`scenarios()` argument that is one literal naming a directory binds every feature file under it. A `@scenario` keeps
its feature file with its title, so a title two features share no longer reads as unbound, and a unique one no longer
binds the wrong feature. A binding in a function body, and an `fr"…"` path, are undecided rather than read as
literals, and escapes are read as Python reads them. `import pytest_bdd, os` is read. "No imports" and "any imports"
are layering rules again (A-219), a quotation names no contract, and a short contract name counts in backticks or
quotes (A-218). A Python `steps` package is Code where no feature file is. The reads of Toads, tutors-mono-repo and
every subject are unchanged.
