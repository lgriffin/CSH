# 22. The analysis A3, and what 1.0 means

Leigh asked on 28 October 2026: "Holistically what else can we include for our evaluation? I'm eager to get this to a
1.0 and have it prepped for npm install and to run as a pure CLI. I'm also interested in the A3 report that will
emerge to compliment the output. That needs a dX pass as well." Later the same morning: "The goal is rock solid on
TypeScript and other language support is experimental and we should treat it as such", and "Lets use Apache Camel as
the Java benchmark and Hadur_Robot".

This document states what stages 76 to 80 build. Stage 76 (the npm package) is recorded in
[ADR-36](../adr/ADR-36-npm-package.md). Fixtures start at F227.

**What does not change.** Converged, gap and indeterminate stay the three outcomes. The A3 of an analysis decides
nothing: it reads the analysis, and every number on it is counted from the analysis. It never changes an outcome,
never scores a repository, and marks everything that is a hypothesis as one. The analysis and its HTML are unchanged
by this document except where section 3 says so.

## 1. The A3 of an analysis (stage 77)

An analysis is a list of results. A person who opens it wants to know what the problem is, where it sits, and the few
changes that close the most of it. That is what a Lean A3 is for, and why the component A3 (spec 09, section 5) has
one. The component A3 needs a person's judgments before it says anything. The analysis A3 needs none: `csh analyse`
writes it beside the analysis, and a person can start from it.

**Files.** `csh analyse` writes `csh-a3.json` (`csh-analysis-a3/v1`), `csh-a3.md` and `csh-a3.html` beside
`csh-analysis.json` and `csh-analysis.html`, under `--out`. The Markdown is made to be pasted into an issue or a pull
request. Each result the A3 names links to its entry in `csh-analysis.html` by the entry's anchor.

**Causes.** Every kind of result belongs to one cause, a family of kinds that share how they arise (A-273):

| Cause | Kinds |
| --- | --- |
| The code breaks a stated rule | `violated`, `not-met`, `not-preserved`, `failing-test` |
| Statements contradict each other | `state-conflict`, `joint-conflict`, `example-conflict`, `claim-conflict`, `example-divergence`, `vacuous` |
| Prose has drifted from the code | `fact-conflict`, `dangling-reference`, `stale-prose`, `status-unsupported`, `symbol-undecided` |
| The design is drawn apart from the code | `arch-conflict`, `undrawn-dependency`, `unobserved-relation`, `unplaced-package` |
| Claims nothing checks | `unverified`, `uncited`, `unobserved-terms`, `no-example`, `no-rule`, `single-source`, `unexercised`, `unbound`, `stepless-scenario`, `unbound-scenario`, `undefined-step`, `unused-step-definition` |
| Test outputs out of step with their cases | `unaccepted-case`, `orphan-output`, `obsolete-snapshot`, `baselined`, `shared-stem`, `unpaired-outputs`, `snapshot-undecided` |
| Changes with no trace | `untraced-change` |
| What CSH could not read or decide | every other kind |

A converged result belongs to no cause.

**Place.** Each result has a place, so that one change can clear many results. The subject of an entry starts with
its source's name; without that, and without any `#` fragment, what remains is a path. A path with directories is
placed at its directory, to two levels: one folder of documents, or one tree of tests, is one place. A file at the
root is placed at itself, and an item's identifier, with no directory and no extension, at its source (A-274).

**The sheet** has seven blocks, in the order of a Lean A3.

1. **Background.** The repository, its commit, and whether the profile was proposed or given. The coverage line of
   the analysis. How many told rules were lifted from prose.
2. **Current condition.** The count of each outcome, the count of refuted and masked entries, and, for each
   practice, how many of its entries landed in each outcome.
3. **Where the problem is.** A Pareto of causes over every gap and indeterminate entry: each cause, its count, its
   share and the cumulative share, largest first, ties by the table's order. The vital few are the causes up to and
   including the first that brings the cumulative share to 80%.
4. **Why.** For each vital cause: what CSH saw (its kinds, with counts), where it concentrates (its three places
   with the most entries), and the usual mechanism behind it, marked as a hypothesis for a person to confirm.
5. **Goal (proposed).** A target CSH proposes and a person sets: every danger entry closed, the largest vital cause
   halved (rounded up), and every indeterminate entry decided or justified. A goal with nothing to close says so.
6. **Countermeasures.** Results grouped by kind and place, each group one action: what would close it (the entry's
   `next`), how many results it clears, and the anchors of its first five. Danger groups come first, then the rest
   by the count they clear, largest first, then by kind and place. The first ten are listed; the rest are counted.
   Each countermeasure has an id `C1`, `C2`, and so on, stable for one analysis.
7. **Follow-up.** The commands that check the countermeasures: `csh analyse <path> --at <commit>` after a change,
   `csh analyse --expected` to hold a result in CI, and `csh init --subject` to keep a profile beside the repository.

**Fixture F227.** A small TypeScript repository with a refuted reference, unverified requirements and a test that
cites one of them. Its A3's Pareto, vital causes, goal and first countermeasures are fixed by the expected result.

## 2. The A3's developer experience (stage 78)

The A3 is read by a developer deciding what to do next, often in a terminal or a pull request. Stage 78 checks it
against the TypeScript subjects (ESI.ts, tutors-mono-repo, lgriffin/TypeScript and the lockout example) and against
these rules:

- **Start here.** The first thing on the sheet, and the last thing `csh analyse` prints, is the first three
  countermeasures, each one line: what to do, where, and how many results it clears.
- **Plain names.** Every kind is shown with a plain name beside its code: `unaccepted-case` is "test cases with no
  accepted output, which the runner may skip". The code stays, so a person can search for it.
- **Every number has a denominator.** "282 of 298 gaps", never a bare 282.
- **Hypotheses are marked.** The mechanism in block 4 and the goal in block 5 say they are CSH's proposal.
- **Works without the page.** The Markdown holds everything the HTML does but the layout, and renders on GitHub.
- **Prints on one sheet.** The HTML prints on A3 landscape, in light colours, with links shown as their anchors.
- **Readable in both themes and at phone width.** Dark mode follows the system, and no block scrolls sideways except
  a table.
- **Empty states say what they mean.** "No gaps: every result converged" rather than an empty table.

## 3. TypeScript is supported; other languages are experimental (stage 78)

TypeScript and JavaScript are read by the TypeScript compiler (facts-ts); Python, Java, Go and Rust by tree-sitter
grammars and readers built in stages 29 to 37. 1.0 is a promise about the first only (A-275).

- The analysis records the code files it read by language: `languages`, each with its file count and its status,
  `supported` for TypeScript and JavaScript, `experimental` for Python, Java, Go and Rust. A language CSH knows of and
  cannot read is `unread`.
- The terminal output, the analysis HTML and the A3 each say, once, when the repository holds experimental code:
  "Python, Java, Go and Rust are read by experimental readers: their results may be incomplete or wrong." A
  countermeasure whose place is a file of an experimental language is marked experimental.
- Documentation and the npm README say the same.

## 4. The 1.0 evaluation (stages 79 and 80)

Before 1.0 the calibration runs become a benchmark, with a number for each claim the README makes.

- **Precision, from labelled subjects (stage 79).** Each TypeScript subject (ESI.ts, tutors-mono-repo,
  lgriffin/TypeScript, taskboard from lgriffin/AI-Reference-Projects) is pinned to a commit, with a labels file,
  `evaluation/labels/<subject>.json`, that judges every gap and indeterminate entry of its cold analysis true or false
  by hand, with a sentence a reviewer can check against the repository. True means the entry is right about the
  repository and acting on it would be right; an indeterminate entry is true when CSH cannot decide it from what it
  reads, and false when a file it reads, or could read with a reader it has, decides it.
  `csh analyse <dir> --labels <file>` (`csh-labels/v1`: the subject's repo and commit, then one label per entry by
  outcome, kind and subject) prints the precision overall and per kind, and exits 1 when an open entry is unlabelled, a
  label names no entry, the labels judge another commit, or a refuted entry is labelled false. CI runs it on each
  subject, so 1.0 requires every subject to meet its labels. The lockout example is not a subject: it sits inside this
  repository, so a cold analysis of it reads CSH's own profile.
  The first labelling found false refutations (a module named without its extension, a former file, ignored build
  output, a path written from a fixture's root), false unverified rules (a rule that names its own check, a dated
  record), false step gaps (jest-cucumber's literal steps, named fixture directories, steps in a unit test), and 282
  false `unaccepted-case` gaps on lgriffin/TypeScript, each fixed in stage 79 (A-278 to A-287).
- **Recall, from seeded drift (stage 80).** For each TypeScript subject, a set of drifts applied to a copy at the
  pinned commit: a renamed function a document names, a deleted file a document links, a broken import rule, a
  removed accepted output, a test that stops citing its requirement. CSH must report each one as the gap the drift
  should cause. CI reports how many it found.
- **Stability.** Two analyses of commits that differ only in an unrelated file have the same anchors for every
  unchanged entry, so a countermeasure can be tracked across commits.
- **Cost.** CI records the time and peak memory of each subject's analysis.
- **Experimental subjects.** Apache Camel (tag `camel-4.23.0`) and lgriffin/Hadur_Robot for Java, Toads and
  fastapi-clean-example for Python, go-clean-arch for Go, hexarch for Rust. They are pinned and run in CI, and their
  counts, time and memory are reported in the job summary, but they do not gate a release and are not labelled.

## 5. Limits

- The causes and their mechanisms are a reading of kinds, not of the repository. A cause is a hypothesis about why
  the results arose, for a person to confirm or reject.
- The goal is proposed, never set: a team may rightly accept some gaps.
- The analysis A3 has no stages. To follow a problem across commits with judgments, open a component A3 (spec 09,
  section 5) from a profile.
