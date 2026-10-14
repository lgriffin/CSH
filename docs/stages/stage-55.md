# Stage 55: The analyse command

**Exit:** F160. One zero-configuration command, `csh analyse <path>`, reads a repository cold: it proposes a profile,
lifts told rules from the repository's own words, reads its code and tests, checks, and places every result, with no
profile, no ledger and no GnuPG ([16](../spec/16-analyse-danger-grain.md), section 2).

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 55. The CI job `Subject (<name>)` now also analyses each polyglot
subject cold, and again through its profile, which must meet its expected results.

## Built

- `adapter-items` (`told`, `markdown`): the setting `told: sentences` lifts each layering sentence and each EARS sentence
  with no identifier as a `requirement` item at its line, `<path>#L<line>`, cited as the sentence
  ([A-190](../../ASSUMPTIONS.md)). Lifted rules are told rules, so the Assertion Ladder grades them and nothing a
  profile states raises their rung.
- `run` (`propose`): nested language manifests, Mermaid C4Container diagrams as an `Architecture` source, and the
  option `lift` ([A-191](../../ASSUMPTIONS.md)).
- `run` (`analyse`): the command's work, on a private clone of one commit, with `evaluateProject`'s new `ledger: false`
  ([A-189](../../ASSUMPTIONS.md)).
- `check` (`analysis`): `csh-analysis/v1` and its text and HTML, in the order the spec gives: danger, conflicts, gaps,
  indeterminate, converged, counts. Danger is empty until stage 56.
- `cli`: `csh analyse <path> [--at] [--json] [--out] [--profile] [--budget]`.
- `testkit`: the fixture expectation `analyse`.
- [Q-48 to Q-53](../../QUESTIONS.md) are recorded, each built on its proposed answer; [issue 78](https://github.com/lgriffin/CSH/issues/78) asks
  the owner to confirm them.

## What the fixture and the subjects revealed

- Two inputs of F160 were wrong before its first run, and were changed with no expectation changed. "Nothing here
  depends on luck" has the shape of a layering rule ("nothing here depends on the store"); a test on words alone cannot
  tell the two apart, so the sentence became one that restricts nothing. A Go test named `TestSTK_1ReserveFits` cites
  nothing, under the known limit on an identifier inside a camel-case name; it became `TestSTK_1_ReserveFits`.
- go-clean-arch at its pin, cold: seven told rules lifted from the README's Clean Architecture list (each item's
  heading, such as "Independent of Frameworks.", is a sentence of its own), all `unverified` at L2, and no other
  result: with no identifiers, no results and no diagram, a cold read of that repository says what its README states
  and that nothing checks it. Its profile, read through `--profile`, meets every expectation.
- CSH itself, analysed from its own checkout, is read through the profile beside it (`csh/component.json`). Its three
  architecture rules are unknown, because their facts come from a harness, and analyse runs none.

## Not done

- A Mermaid diagram inside a Markdown file is not proposed; only a `.mmd` file of its own is.
- Go, Java, Python and Rust packages are not yet placed in a diagram's containers: their `package` facts are stage 58.
- Lifting is a test on words, so a sentence that restricts a dependency on something that is not code ("depends on
  nothing but goodwill") is a told rule too. It is cited as written and never checked against the code, so the cost is
  one `unverified` gap.
