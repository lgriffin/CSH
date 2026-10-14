# Stage 59: Evidence per ecosystem

**Exit:** F174 to F178. In each of TypeScript, Java, Python, Go and Rust, a rule or claim the code refutes, cited by a
test that passed in the committed results of that ecosystem's runner (Vitest, Surefire, pytest, `go test -json`,
cargo-nextest), reads as masked danger, green over refuted; the claims are decided over Java interfaces, Go embedded
structs and Rust supertraits; and the step definitions of Cucumber-JVM, behave, godog and cucumber-rs are matched
against the scenarios ([16](../spec/16-analyse-danger-grain.md), sections 3 and 5).

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 59. Every subject in CI meets its expected results unchanged. F174 to
F176 are the masked cases of the three taskboard receivers that Q-53 asked for.

## Built

- `check` (`check`, `danger`): the report's `cites`, the items each fragment cites; a broken rule or refuted claim whose
  cited items passed in the runner's results, with nothing failed, is masked, green over refuted
  ([A-200](../../ASSUMPTIONS.md)).
- `facts-code` (`java`, `rust`, `go`) and `witness`: a declaration's `bases`, its supertypes after its `base`.
- `arch` (`claims`): `inherits` follows every supertype, over classes, interfaces, traits, structs, records and enums
  ([A-201](../../ASSUMPTIONS.md)).
- `adapter-items` (`steps-other`): behave, Cucumber-JVM, godog and cucumber-rs step definitions in style `cucumber`
  ([A-202](../../ASSUMPTIONS.md)).
- `testkit`: a project run's expectation may name `danger`, `dangerAbsent` and `dangerCount`.

## What the fixtures and the subjects revealed

- ESI.ts reads two of its claims beside passing tests. One is a claim the code refutes (the errors subpath and
  `isCircuitOpen`), whose eleven citing tests pass: masked, as A-200 says. The other was a conflict between two of its
  own claims, six entry points against seven; the first reading marked it masked too, and it stays refuted now, since
  two statements that disagree are no test's business.
- The Java JUnit join, the pytest JUnit XML join, `go test -json` and cargo-nextest were joined since stage 35; what
  this stage adds is reading the results beside the verdicts.

## Not done

- Stale evidence (results committed at a commit older than the files they cover) is not marked: a results file that
  names another commit is still joined to nothing, with the warning `results-other-commit`.
- Rust's `impl Trait for Type` is not read as a supertype of the type.
- Gradle, `setup.cfg`, `setup.py`, `requirements.txt` and `module-info.java` (the spec's manifests row), and `total` for
  Python and Go, remain open.
