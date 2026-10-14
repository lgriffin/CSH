# Stage 57: Grain

**Exit:** F165. A told rule whose citing tests do not observe the terms it names is a gap that names the missing terms
and the reader that read each test, in each of the five languages, and masked danger
([16](../spec/16-analyse-danger-grain.md), section 4).

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 57. Every subject in CI meets its expected results unchanged, with no
`unobserved-terms` entry.

## Built

- `witness`: an item edge may carry `observes`, the identifiers its source observes, and `reader`, the reader that read
  them.
- `adapter-items` (`tests`, `gherkin`): each citation from a test carries the test's grain and its reader (`typescript`,
  `python`, `java`, `go`, `rust`); each scenario's citations carry the words of its title, background, steps and
  examples, read by `gherkin` ([A-196](../../ASSUMPTIONS.md)).
- `check` (`grain`): `termsOf` reads a statement's backticked identifiers ([A-197](../../ASSUMPTIONS.md)); `observesTerm`
  and `unobserved` compare them with what the citations observe ([A-198](../../ASSUMPTIONS.md)).
- `check` (`trace`, `danger`): the gap `unobserved-terms` on a told rule, whose detail names the terms, the citing spans,
  what they observe and the reader; masked danger `citation-without-observation`, whose green is the citation. The rung
  is not changed: grain is a separate axis.
- `testkit`: an analysis entry expectation may name `detailIncludes`.
- [Q-55](../../QUESTIONS.md) records the one departure from the spec: a citation with no grain skips the comparison
  rather than giving an indeterminate entry.

## What the fixtures and the subjects revealed

- The first reading blanked every string in a test body, so the taskboard subjects read as five false gaps: their rules
  name status values (`done`, `in_progress`, `validation_failed`) that the tests compare as strings. A string literal
  that is a single identifier is now read as a value the test observes; prose in a string, a title among them, is not.
- ESI.ts read one false gap on `DES-02`: the test that cites it is a `describe`, and a body that ended at the next
  declared test held none of the describe's tests. A TypeScript test's body is now its call, to the closing parenthesis.
- In Python, Java, Go and Rust a citation first took its body from where the citing text sits, so a Java
  `@DisplayName` above a method read only as far as the method's name, and a Python docstring read the next test's body: the Java subject
  read seven false gaps. Each citing text now names the tests it is about, its own or each test of the class it
  annotates.

## Not done

- The grain of a CSL predicate against a probe's witness, and the range a statement bounds on each term: only told
  rules in prose are compared.
- Quantities in a statement (`3`, `15 minutes`) are not terms.
- Bodies in Python, Java, Go and Rust are approximated by declaration offsets, not read from the syntax tree.
