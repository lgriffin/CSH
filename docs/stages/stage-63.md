# Stage 63: What the TypeScript run asked for

**Exit:** fixtures F189 to F191, written from [19](../spec/19-from-the-typescript-run.md) before the code. Every subject
in CI still meets its expected results and its `analysis-expected.json`. A cold read of lgriffin/TypeScript at
`a91e938` reports neither false finding of [issue 89](https://github.com/lgriffin/CSH/issues/89), and reports
`tsc/internal/format/README.md` as a dangling reference naming `rules.ts`.

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 63.

## Built

- `adapter-items`:
  - `markdown`: a path named as the object of a verb of making is unchecked (A-220).
  - `markdown`: the target of a relative link, image or link reference definition is a `mentions-file` edge, resolved
    from the document's directory (A-222).
- `run`:
  - `propose`: with no identifier scheme, the Tests practice cites nothing, and a guess says so (A-221).
- `run`: `history`: a glob ending in `**` matches every file under its directory.
- `testkit`: an analyse fixture's entry may name `detailExcludes`, text its detail must not hold.
- [Q-62](../../QUESTIONS.md) records the choice of A-221.

## After review

The review of the stage found link and verb readings it missed, each now covered by a test, and by F189 and F191. A
verb of making negated in its clause ("do not touch `x`") keeps the path a claim. A link from a root-level document is
checked at its resolved path, not as a bare name, so a broken one is reported. A link in a Verified by field is read. A
link in a double-backtick code span, or to a scheme-less host (`npmjs.com`), is not. A target with balanced
parentheses is read whole, and a link written with spaces inside its parentheses keeps its sentence.

## What the run revealed

| | Before | After |
|---|---|---|
| Refuted danger | 2, both false: a step that says to create a file, and `WTF-8` in a test title | 1, real |
| Dangling references from links | not read | 1: `tsc/internal/format/README.md:22` links `rules.ts`, which the Go port replaced with `rules.go` (lgriffin/TypeScript#1) |

The read still finds little else, because TypeScript has little prose to test: 65 documents, no identifier scheme and
no layering sentences. What CSH does not reach there (symbols named in plain prose, task runners such as `hereby`, and
baseline test suites) is listed on issue 89 for later stages.

One subject's cold read gains a gap, and it is real: hexarch's README shows a banner image,
`public/hexagonal-architecture-og.jpg`, that the repository does not track. Its `analysis-expected.json` now expects
it. No other subject's expected results change, and neither do the cold reads of Toads at `6f7256e` or tutors-mono-repo at
`1279669`. ESI.ts's guides link `.beads/issues.jsonl`, an export of its issue tracker, which CSH did not read before
because the backticked path starts with a dot. Read through the link, it made the lines that name it stale prose each
time the export changed. The ESI.ts profile now lists `.beads/**` as volatile, as a file that changes all the time
leaves no prose stale. That showed that a history glob ending in `**` matched only directories, never the files under
them, so `.beads/**` matched nothing. It now matches everything under the directory. No profile used one before.

The prose-drift A3 of ESI.ts changes in one finding at every stage, v10.0.0 to v11.3.0. The charter's plan says
"`scripts/doc-metrics.ts` writes `etc/doc-metrics.json`", a file the script generates, so that path is no longer part
of the dangling reference at `guides/CHARTER.md:728`. The A3 is rebuilt to match.
