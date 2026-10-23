# 21. Reading test suites as evidence

`csh analyse` read [lgriffin/TypeScript](https://github.com/lgriffin/TypeScript) at `a91e938` cold, on 23 October 2026.
It is the Go port of the TypeScript compiler. CSH read 31,872 of its 67,927 tracked files and understood a thin slice of
them. 62,185 of the tracked files sit under `tsc/testdata`: 12,974 compiler test cases in `tests/cases`, and their
accepted outputs in `baselines/reference`, 26,038 `.symbols` and `.types` files, `.js` and `.errors.txt` files, and
fourslash `.baseline` files. The compiler's runner compiles each case and compares what it writes with the accepted
output. A difference fails the test, and a person accepts the new output by committing it. These files are the
compiler's specification more than any prose in the repository is, and CSH read none of them as evidence. Worse, it
read the 12,974 cases as the compiler's own code, and 42 accepted outputs written in Markdown as its documents.

[Issue 89](https://github.com/lgriffin/CSH/issues/89), gap 6, records this. Leigh asked for it to be a capability of
its own: CSH reads a repository's tests as evidence for what its documents and its code say, in every language. This
document states the behaviour stages 70 to 73 are built from. Its fixtures start at F210.

**What a test suite is evidence of.** Three things, each read without running anything:

1. **That a case has an accepted output.** A golden, snapshot or baseline suite pairs each case with the output a
   person accepted. A case with no accepted output checks nothing, and an accepted output that no case produces is
   evidence of nothing. Both are found from the files' names (section 2).
2. **That each snapshot entry belongs to a test.** A snapshot file holds one entry per assertion, keyed by the test's
   name. An entry whose test is gone is obsolete: it reads as checked behaviour and checks none (section 3).
3. **That what prose names, a test exercises.** A sentence that names a symbol of the code is borne out by the tests
   only as far as a test mentions that symbol. A symbol no test mentions is described and not exercised (section 4).

**What does not change.** Converged, gap and indeterminate stay the three outcomes, and every result here lands in
exactly one. Nothing is scored. A test that mentions a symbol exercises it; it does not verify a sentence, so nothing
here raises a rung on the Assertion Ladder, and a test still cites only what its title names
([18](18-from-the-toads-run.md), section 6, and A-221 hold). CSH never runs a suite and never compares an output with
what the code would write today: that is the runner's job, and a results file is how its verdict reaches CSH (A-115).
Where a convention cannot be read from the files, the result is indeterminate and says what would decide it.

## 1. A suite, its cases and its accepted outputs

A **suite** is a set of **cases** and a set of **accepted outputs**, with a convention that pairs them. A case is the
input a runner reads: a source file, a test file, a directory of inputs. An accepted output is a file the runner
compares what it writes with: a baseline, a golden file, an approved file, a snapshot file.

**The Outputs source** (A-260). A source of kind `Outputs` is read by the adapter `@csh/adapter-items/outputs`. Its
files are every case and every accepted output of the suites it reads. It belongs to the practice that owns the
repository's tests.

**Files read by name** (A-261). A declared source may name `names`: globs, relative to its `at`, of files whose bytes
are never opened. The adapter is handed their paths with no content. A suite pairs by name, so a tree of accepted
outputs is read whole without reading it: TypeScript's 289 MB of baselines cost CSH their paths. A file read by name
counts as read in the coverage line, which says how many were read by name. Any source may use `names`; a source
whose adapter needs the content of a file it reads by name sees an empty file, and the adapter's own documentation
says which of its files it needs.

**Test data is not code** (A-262). The proposal leaves out of the Code, Documents and Tests sources every file under
a directory named `testdata`, which Go's tooling ignores by definition and every other language uses for the same
purpose, and out of Code and Documents every file of a suite that is not a test file. A case of UI outputs leaves
Tests too: cargo compiles none of them as a test. A `.ts` case is not a module of the compiler, and a `.baseline.md`
is not a document. A file under `testdata` that no suite pairs is read by no source, and is counted as not read.

## 2. Accepted outputs paired by path (stage 70)

The adapter reads five conventions from the paths of its files. Each is a common way a language's runners keep
accepted outputs.

| Convention | Accepted outputs | Their cases | Typical of |
|---|---|---|---|
| Reference tree | every file under `R/S`, where `R` ends in `baselines/reference` | every file under `C/S`, where `C` is a directory named `cases` whose parent is the directory holding `baselines`, or a child of it | the TypeScript compiler, in TypeScript and in Go |
| Mirrored directories | every file under `D/expected`, `D/output`, `D/outputs`, `D/golden` or `D/goldens`, where `D` is or sits beneath a directory of tests or test data (`test`, `tests`, `__tests__`, `spec`, `specs`, `testdata`, `testing`, `fixtures`, `__fixtures__`, `e2e`, or a name ending in `-test`, `_tests` and the like), so that a program's own `src/io/input` and `src/io/output` stay code | every file under `D/input` or `D/inputs`, the same directory `D` | Python and Java data-driven suites |
| Golden siblings | a file `F.golden` or `F.expected` | the sibling `F`, or else the one sibling whose stem is `F` | Go (`gofmt`'s `x.input` and `x.golden`), analyzers' `x.go.golden` |
| UI outputs | a `.stderr` or `.stdout` file under a directory named `ui` beneath `tests` | the sibling `.rs` file of the same stem | Rust (`trybuild`, `compiletest`) |
| Snapshot directories | a file in a directory named `__snapshots__` or `snapshots` | the test file in the directory above that the file's name names (below) | Jest and Vitest, syrupy, insta |
| Approved files | a file `X.m.approved.<ext>` | the sibling test file whose stem is `X` | ApprovalTests in Java, Python and others |

**Stems.** A file's stem is its base name less its last extension. An output of a reference tree or of mirrored
directories belongs to a case of its suite when the output's base name is the case's stem, or the stem followed by
`.` or `(`: `2dArrays.ts` accepts `2dArrays.types`, `2dArrays.errors.txt` and `2dArrays(strict=false).js`. When the
names of two cases both fit, the longer stem wins (`a.b.ts` takes `a.b.js` from `a.ts`). In a reference tree the
case and the output may sit at different depths below `C/S` and `R/S`, since TypeScript nests its conformance cases
and keeps their baselines flat. Mirrored directories pair only at the same path below `input` and `expected`.

**Snapshot names.** In a `__snapshots__` directory, `a.test.ts.snap` names the test file `a.test.ts` (Jest, Vitest)
and `test_a.ambr` names `test_a.py` (syrupy), as does a directory `test_a/` of single-file snapshots. In a
`snapshots` directory, an insta snapshot `crate__module__name.snap` names its test by its header (section 3), so it is
paired in stage 74 and is unpaired until then.

**Suites.** A reference tree has one suite for each child `S` of `R` that has a namesake child of `C`. The other
conventions have one suite for each directory that holds accepted outputs.

**What the pairing decides,** with each result in one outcome:

| What the files show | Signal | Outcome |
|---|---|---|
| A suite with cases that have accepted outputs | `accepted-outputs`: how many cases, how many with outputs, how many outputs, where | converged |
| A case of a reference tree or of mirrored directories with no accepted output | `unaccepted-case`: the case checks nothing the runner can compare | gap |
| An accepted output of a reference tree, mirrored directories, UI outputs or a snapshot directory that no case of its suite produces | `orphan-output`: it reads as checked behaviour and nothing produces it | gap |
| Two cases of one suite with the same stem | `shared-stem`, its subject the stem in the first case's directory: which case wrote the outputs of that stem is not decided; neither is a gap | indeterminate |
| Accepted outputs no convention pairs: a child of `R` with no namesake case directory, a golden file with no sibling, an approved file with no sibling test, an insta snapshot | `unpaired-outputs`, one per directory, with how many files and an example | indeterminate |

`unaccepted-case` says why it matters and what would close it: accept the case's output, or remove the case if the
runner is meant to skip it. A runner may skip a case on purpose, as TypeScript's skips 42 cases by name and others by
an option it no longer supports, and a runner may write nothing for a case that passes, as TypeScript's does for a
case that asks for no emit and no type baselines and compiles clean. CSH does not read the runner, so the gap says
both ([Q-80](../../QUESTIONS.md)). A golden sibling, a UI output and an approved file are found from the output, so a case
with none is not a case of the suite, and is never reported. A trybuild case that must compile has no `.stderr`.

**What a suite is not.** `accepted-outputs` is converged on what the names show: a person committed an output for
each case. It does not say the output is right, nor that the runner passed. The tests that compare them are the
runner's; their results, joined as any results are (A-115), say whether they pass.

**The proposal.** `csh analyse` and `csh init --subject` propose an `Outputs` source when the tracked files hold any
of the conventions above. Its `include` names each suite's files; its `names` names every file of a reference tree
or mirrored directories, whose content stage 70 to 73 never read. Snapshot and approved files are read with their
content, which stage 71 needs. The guess says how many suites, cases and outputs, and the convention of each.

## 3. Snapshot entries and outputs named after a test (stages 71 and 74)

A snapshot file holds an entry for each snapshot assertion, keyed by the name of the test that made it. Some golden
files are named after their test rather than after a case. Each language's convention is read from the snapshot
file and the test it names, as the runner reads them.

| Language | Snapshot or output | The test it names |
|---|---|---|
| TypeScript | Jest and Vitest `.snap`: each ``exports[`name n`]``, where `name` is the test's full name (its describe titles and its own, joined by spaces in Jest and by ` > ` in Vitest), optionally a hint, and `n` a counter | a test of the paired test file with that full name |
| Python | syrupy `.ambr`: each `# name: test_x`, `# name: TestC.test_x`, with any `[params]` and `.n` | a `test_` function of the paired module, or a method of a `Test` class in it |
| Rust | insta `.snap`: the header's `source:` names the file; the name after the last `__` is the snapshot's name, less a `-n` suffix | a function of that file whose name is the snapshot's name, or `test_` and it; or a literal first argument of an `assert_*snapshot!` call in that file |
| Java | ApprovalTests `X.m.approved.<ext>` | a method `m` of the test class `X` |
| Go | a golden file named `TestX.golden` or `x.golden` beside a package's tests, or in its `testdata` | a function `TestX` of a `_test.go` file of that package |
| Any | an output whose stem is a test file's stem less its test affix (`_test`, `.test`, `.spec`, `test_`, `Test`), when exactly one test file has that stem | that test file, as TypeScript's fourslash baselines name theirs |

**What the entries decide:**

| What the files show | Signal | Outcome |
|---|---|---|
| A snapshot file whose every entry names a test of its file, or an output named after a test that exists | `accepted-outputs`, one per snapshot file or directory | converged |
| An entry that names no test of its file, and the file declares every test title as a literal | `obsolete-snapshot`: the runner keeps it and no test reads it | gap |
| An entry that names no literal test, in a file with a title CSH cannot read (a template with a placeholder, `each`, `parametrize` with ids it cannot read) | `snapshot-undecided`, naming the file | indeterminate |
| A snapshot file whose test file does not exist | `orphan-output`, as in section 2 | gap |

**Reading the names** (A-266). A Jest or Vitest key is read as the runner writes it, with `` \` ``, `\\` and `\${`
unescaped. A test's full name is the titles of the describes around it and its own, joined by a space in Jest and by
` > ` in Vitest, as the file's first line (`// Jest Snapshot v1`, `// Vitest Snapshot v1`) says; a skipped or
todo test still has its name, since the runner keeps the entries of a test it skips, and Jest's aliases `xit`, `fit`,
`xtest`, `xdescribe` and `fdescribe` are read as the calls they stand for. A title is read exactly, its spaces kept. It
is unreadable when it is not a literal standing alone as the first argument, is a template with a placeholder that no
backslash escapes, or is a `.each` or `.for` title with a `%` or `$` format, and every
name beneath an unreadable describe is unreadable too. An entry names a test when the key, less its counter, is the
test's full name, or that name followed by a hint: `: hint` in Jest, ` > hint` in Vitest. A file with neither first
line is read both ways.

**Named after a test file** (A-267). An output the conventions of section 2 left unpaired is named after a test file
when its base name is the test file's stem less its affix, or that followed by `.` or `(`, the longest stem winning.
The test files are the files of the checkout the proposal reads as tests by their affix: `x.test.ts` and `x.spec.js`
in any JavaScript or TypeScript extension, `test_x.py` and `x_test.py`, `XTest.java` and `XTests.java`, and
`x_test.go`. A file that is itself an accepted output is never one. A stem two test files share pairs
nothing, and its outputs stay unpaired, naming why. A test file whose stem names outputs of more than one suite keeps
those of the suite its own directory's test files name most: TypeScript's fourslash test
`rewriteRelativeImportExtensionsProjectReferences1_test.go` writes a fourslash baseline, and the `tsc` baseline of
the same name is written by a scenario of `tsc_test.go`.

A Jest or Vitest test that calls `toMatchSnapshot()` and has no entry is not reported: the runner writes the entry on
its next run, and fails in `--ci` mode. That is the runner's verdict to give, not CSH's. An inline snapshot lives in
the test file and is not an accepted output.

## 4. What prose names, tests exercise (stage 72)

A sentence that names a symbol of the code, such as "`createRulesMap` in `rules.ts` builds the table", says something
about that symbol. Stage 24 and later stages resolve such names against the code's facts, and a name that resolves to
nothing is a `dangling-reference`. A name that resolves says the symbol exists. It does not say the symbol is tested.

**The tests' mentions** (A-264). The run reads every test file of every `TestFiles` source for the identifiers its
code mentions, with comments and strings left out, by the same lexers that read each language's tests. That is the
grain of a test (stage 57) for every test, not only one that cites an item. It is a port the run supplies to the
check, as history is, so no adapter reads another source's files.

**What it decides,** for each document or told rule that names code symbols that resolve:

| What the tests show | Signal | Outcome |
|---|---|---|
| Every symbol it names is mentioned by a test | `exercised`: each symbol with the tests that mention it, the first three by path | converged |
| A symbol it names that no test mentions | `unexercised`: the symbols no test mentions, and those a test does | gap |
| A symbol whose module is in a language of which no test file was read, or whose test files could not be read | `exercise-undecided`, naming the language or file | indeterminate |

A symbol is mentioned when a test file's code holds an identifier equal to its name, the last part of a member's name
(`Basket.add` is `add`). The languages are those whose tests the stage 57 lexers read: TypeScript and JavaScript,
Python, Java, Go and Rust. The language of a symbol is its module's; a name of a package's code (stage 67) takes the
language of the module that declares it. A document whose undecided symbols are its only ones is `exercise-undecided`;
one with a symbol no test mentions is `unexercised`, its undecided symbols named beside the others. A repository with no
`TestFiles` source gives none of the three signals.

A mention is the weakest evidence a test can give: the test touches the symbol and may observe nothing of what the
sentence says. That is why it is `exercised` and never `verified`, and why the rung is unchanged. The gap it closes is
real: a described symbol that no test mentions is behaviour the repository's words promise and nothing exercises.

**`unverified` names its nearest tests.** A requirement or told rule with no citation is `unverified`. When tests
mention every backticked term it writes (each term an identifier some test file's code holds), the gap names up to
three of those test files, by path, as the tests that could cite it. It stays
a gap: the citation is the input that would close it (A-265).

## 5. Calibration (stage 73)

The cold reads of every subject in CI keep their expected results, changed only where this document says. The cold
read of lgriffin/TypeScript at `a91e938`:

- reads every file under `tsc/testdata` that a suite pairs, by name, and reads no case as code and no baseline as a
  document;
- reports the compiler, conformance and transpile suites as `accepted-outputs`, and the fourslash baselines as named
  after their tests;
- reports each case with no accepted output as `unaccepted-case`, each of which the runner skips, by name or by an
  option it does not support, or writes nothing for when it compiles clean;
- reports the two cases that share a stem with a `.js` file the runner never compiles as `shared-stem`.

Each finding is checked by hand before it is called real, and each real one is reported to the repository as Leigh
directs, never upstream to microsoft/TypeScript by CSH.

## 6. Limits

- **The runner is not read.** A skip list, a filter, a generated test, a custom file pattern: CSH reads conventions,
  not the runner's code. A case it calls unaccepted may be skipped on purpose, or accepted as writing nothing; the gap
  says so ([Q-80](../../QUESTIONS.md)).
- **Content is not compared.** An accepted output can be wrong, and a case can produce something other than what was
  accepted. Only the runner decides that.
- **Variants are not checked.** TypeScript names an output for each variant of a case's options, as
  `x(strict=false).js`. CSH pairs it with `x` and does not check that the case still declares that variant.
- **Mentions are not observations.** A test that mentions a symbol exercises it; whether it observes what the
  sentence says is grain (stage 57), read only where a test cites the sentence.
- **Danger is unchanged.** An orphan output and an obsolete snapshot read as checked behaviour that checks nothing,
  which is the shape of masked danger. They are gaps, not danger, until the owner decides ([Q-81](../../QUESTIONS.md)).

## 7. Stages

| Stage | Exit | Fixtures |
|---|---|---|
| 70 | Accepted outputs paired by path in every language; test data leaves Code and Documents; files read by name | F210 to F216 |
| 71 | Snapshot entries in TypeScript (Jest and Vitest), and outputs named after a test file, in every language | F217 to F219 |
| 72 | What prose names, tests exercise, in every language | F223 to F225 |
| 73 | Calibrate on lgriffin/TypeScript, ESI.ts and the CI subjects | none of its own |
| 74 | Snapshot entries and outputs named after a test in Python, Rust, Java and Go | F220 to F222 |

TypeScript comes first (Leigh, 23 October 2026): stage 71 reads Jest and Vitest snapshot entries and the outputs
named after a test file, which TypeScript's fourslash baselines are, and stage 74 brings the other languages' rows of
section 3 to the same standard, each with fixtures of its own.

- F210: a reference tree (section 2): paired, unaccepted, orphan, shared stem, unpaired.
- F211: Go golden siblings.
- F212: Rust UI outputs.
- F213: Java approved files.
- F214: Python mirrored directories and syrupy snapshot directories.
- F215: Jest snapshot directories, in TypeScript.
- F216: the proposal: an Outputs source, test data out of Code and Documents, files read by name in the coverage.
- F217: Jest snapshot entries: nested describes, a hint, a counter, a skipped test, and an obsolete entry.
- F218: Vitest snapshot entries with a title CSH cannot read: `test.each` with a placeholder, a template with one.
- F219: outputs named after a test file: a Go and a TypeScript test of the stem, a stem two test files share, and an
  output no test file names.
| 75 | What a run read, parsed and skipped; build output only where a build writes it | F226 |

## 8. What a run read, parsed and skipped (stage 75)

Reading most of a repository by name makes "N of M tracked files read" say less than it did: on lgriffin/TypeScript
67,656 files are read, and 62,119 of them only by name. Leigh asked, 23 October 2026, for the count of files touched
and parsed, and for what was skipped to be explained, so that a run can say it read 100% of the files it should.

- **Read** (touched) is a file some source selects. **Parsed** is a file some source reads whole, its content given to
  an adapter. **By name** is a read file no source reads whole (A-261). Read is parsed plus by name.
- **Skipped** is a tracked file no source reads for a reason, the first of these that holds: **installed or vendored**
  (beneath `node_modules`, `vendor`, `coverage`, `.venv`, `venv`, `site-packages` or `__pycache__`), **build output**
  (A-268, below), **test data no suite pairs** (beneath `testdata`, `fixtures` or `__fixtures__`), or **with no
  reader** (no source kind of CSH reads its kind: not code, Markdown, a feature file, a snapshot or a language
  manifest).
- **Eligible** is every tracked file that is not skipped. An eligible file no source reads is a miss of the profile.
- `csh run`'s line ([13](13-from-real-runs.md), section 1.4) and `csh analyse`'s say
  `coverage: R of E eligible files read (P%), Q parsed and N by name; S of M tracked skipped: 42 installed or vendored, …;
  not read: …`. With every eligible file read the head is `all E eligible files read (100%)` and nothing follows the
  skipped counts; with nothing by name it is `all parsed`; with nothing skipped it is `M tracked, none skipped`. The
  percentage is rounded down, so 100% means every one.
- `csh coverage` and `csh init --subject` open with the same line, then list the sources, the skipped files by reason
  and the eligible files not read by extension.

The same run asked why 271 files were not read. Nine of them were the fault of the proposal: the Go package
`tsc/internal/execute/build` is source, but a segment named `build` was never proposed ([13](13-from-real-runs.md),
section 1.1). `dist`, `build`, `out` and `target` name a build's output only where a build writes it: at the
repository's root, or beside a build manifest (`package.json`, `tsconfig.json`, `pyproject.toml`, `setup.py`,
`pom.xml`, `build.gradle`, `build.gradle.kts`, `go.mod`, `go.work`, `Cargo.toml`). A directory of one of these names
anywhere else is source, and is proposed like any other (A-268). `node_modules`, `vendor`, `coverage`, `.venv`, `venv`,
`site-packages` and `__pycache__` are never proposed, wherever they are. The rest of the 271 are vendored, test data no
suite pairs, or files no reader reads (localisation archives, YAML, `go.sum`, licences), and stay unread.
