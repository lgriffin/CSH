# 19. What the TypeScript run asked for

`csh analyse` read [lgriffin/TypeScript](https://github.com/lgriffin/TypeScript), a fork of microsoft/TypeScript
synced to `a91e938`, cold, on 23 October 2026. The repository is now the Go port, TypeScript 7: 67,927 tracked files,
of which CSH read 31,872 in 29 seconds. It reported 2 gaps, 0 indeterminate and 0 converged. Both gaps were refuted
danger, and no told rule was lifted.

A check by hand found both refuted findings false. It also found one real dangling reference that CSH did not read: the
formatter's README links `rules.ts`, which the Go port replaced with `rules.go`. That finding is lgriffin/TypeScript#1.
[Issue 89](https://github.com/lgriffin/CSH/issues/89) lists the defects, D1 to D3. This document states the behaviour
that stage 63's golden fixtures are written from.

Like [17](17-from-the-tutors-run.md) and [18](18-from-the-toads-run.md), nothing here changes the three outcomes. A
mention that does not claim a file is in the tree is unchecked, never a gap.

## 1. A file the reader is told to create is not missing (D1)

**The problem.** The repository's skill for compiler tests says:

> 1. Create `tsc/testdata/tests/cases/compiler/myTest.ts` with test code and directives

The step tells the reader to make the file, so the file not being there is what the sentence expects. CSH read the path
as a claim that it exists and reported the document as prose the code refutes.

**What changes** (A-220). A missing path is unchecked when every sentence that mentions it names it as the object of a
verb of making: `create`, `creates`, `touch`, `scaffold`, `generate`, `generates`, `write` or `writes`, either directly
before the backticked path or with only `a`, `an`, `the`, `new`, `empty` and `file` between them, and optionally
`called` or `named` after those words. "Create `x.ts`", "create a new file `x.ts`" and "the build writes
`out/report.json`" make the path. A path that the same sentence uses as a source is still read: in "Copy
`config/local.example.yaml` to create `config/local.yaml`", only the second path is made. The past tense ("we created
`x.ts`") still says the file is there, so it is still checked.

## 2. A test title cites nothing when the repository has no identifier scheme (D2)

**The problem.** `packages/typescript/test/wtf8.test.ts` has a test titled "preserves WTF-8 encoded lone surrogates".
The proposal found no identifier scheme in the Markdown and Gherkin files. The Tests practice therefore kept the
default pattern, which matches any `PREFIX-number`, and read `WTF-8` as a citation of a requirement nothing defines.
The default leaves out `UTF-8`, `SHA-256` and a few other names by listing them, and no list can hold every encoding,
standard and tracker key a test title may name (`WTF-8`, `JIRA-123`).

**What changes** (A-221). When the proposal finds no identifier scheme, the Tests practice cites nothing: its
`citePattern` matches no text, and the guess says so. With no scheme, a citation names nothing the repository defines,
so nothing it says can be refuted. Where the proposal does find a scheme, a test cites only identifiers of that scheme,
as before.

## 3. A relative Markdown link names a file (D3)

**The problem.** `tsc/internal/format/README.md` says "There are a lot of rules, which you can find in
[rules.ts](./rules.ts)". There is no `rules.ts` in that directory. CSH reads paths written in backticks, and never the
target of a link, so it missed a real dangling reference.

**What changes** (A-222). In a Markdown document, outside fences and inline code, the target of an inline link or image
(`[text](target)`, `![alt](target)`) and of a link reference definition (`[label]: target`) names a file when:

- it is relative: no scheme such as `https:` or `mailto:`, and it does not start with `/`, `#` or `<`;
- once a title, a `#fragment` and a `?query` are taken off and `%` escapes decoded, its last segment has an extension
  other than `.html` or `.htm`. A link with no extension, such as `../guide`, may be a page of a documentation site, so
  it is not read.

The path is resolved from the document's directory, as GitHub resolves it. A target that leaves the repository is not
read. The path is then checked as a backticked path is: missing and not ignored, it is a dangling reference, and a
sentence that says the file is absent or names another repository leaves it unchecked (A-210).

## 4. Limits kept

- **A path relative to a module.** `.github/agents/replay-minimizer.md` names `internal/lsp/replay_test.go`, a path
  inside the `tsc` Go module that its command runs with `go -C ./tsc`. CSH leaves a path whose first segment is no
  top-level entry unchecked (A-210), which is right here.
- **A symbol named in prose.** The same README names `createRulesMap`, which the Go code calls `buildRulesMap`. A name
  in backticks that is not in a `exports`, `declares` or `defines` sentence is not read as a symbol, so this stays a
  finding by hand. lgriffin/TypeScript#1 fixes both.
- **A link with no extension** is not read (section 3).

## 5. Stage 63

**Exit:** fixtures F189 to F191 pass, written from this document before the code. Every subject in CI still meets its
expected results and its `analysis-expected.json`. A cold read of lgriffin/TypeScript at `a91e938` reports neither false
finding of issue 89, and reports `tsc/internal/format/README.md` as a dangling reference naming `rules.ts`.

- F189: a file the reader is told to create (section 1).
- F190: test titles with no identifier scheme (section 2).
- F191: relative Markdown links (section 3).
