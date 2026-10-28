# Stage 78: The A3's developer experience, and experimental languages

**Exit:** the A3 of ESI.ts, tutors-mono-repo and the fixtures read against [22](../spec/22-analysis-a3-and-1.0.md),
section 2, at desktop and phone width, in both themes and printed; and section 3's labels on every output.

**Status:** exit reached. `BUILT_THROUGH_STAGE` stays 77: this stage adds no fixture of its own; F227 holds the A3.

Leigh asked on 28 October 2026 that the A3 have "a dX pass", and: "The goal is rock solid on TypeScript and other
language support is experimental and we should treat it as such."

## Built

- **Start here.** The sheet opens, and `csh analyse` ends, with the first three countermeasures: what to do, where,
  an example result (its subject and the first part of its detail), and how many of the open results it clears.
- **Plain names.** `KIND_NAME` and `kindName` in `check` give every kind a plain name ("a test case with no accepted
  output"), shown beside its code.
- **Denominators.** Every count of the problem is "n of N"; the tiles say "of N results".
- **Layout.** Plan blocks (1 to 5) in two columns, countermeasures across the page in a grid, follow-up below. Two
  tiles per row and one column of facts at phone width; no block scrolls sideways but a table. Print: A3 landscape,
  light colours, each link's anchor printed.
- **Grouping.** A danger result is grouped apart from the rest of its kind and place, and a path is placed at its
  directory to two levels (A-274), so ESI.ts's 47 countermeasures became 22, and tutors-mono-repo's 42 became 22: its
  told rules, one file each in `guides/specifications`, are one place.
- **Experimental languages** (A-275). The analysis records `languages`; the text output, the analysis HTML and the A3
  say once when Python, Java, Go or Rust code was read, and mark a countermeasure whose results are all in such files.
- **A version placeholder** inside a token is not a path (A-277): tutors-mono-repo's `deploy/pin-X.Y.Z`, a branch
  name, was reported as a refuted reference.

## What the run revealed

Each subject read cold, on 28 October 2026:

| Subject | Commit | Gaps | Indeterminate | Converged | Danger | Countermeasures |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| ESI.ts | `39399ab` | 80 | 8 | 15 | 13 refuted, 12 masked | 22 |
| tutors-mono-repo | `d350404` | 75 | 1 | 5 | none | 22 |
| lgriffin/Hadur_Robot (experimental: Java, Python) | `91a3abf` | 148 | 5 | 3 | 11 refuted, 26 masked | 45 |

The first tutors run of this stage put two refuted `deploy/pin-X.Y.Z` references first on its sheet; both were
false, and A-277 removes them.
