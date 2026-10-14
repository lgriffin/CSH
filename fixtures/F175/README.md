# F175

The Java receiver's masked case, over interfaces. `MemoryCardStore` implements `CachedCardStore`, an interface that
extends `Comparable` and `CardStore`, so the claim that it is a `CardStore` (REQ-1) holds through the second interface.
`JdbcCardStore` implements only `CardLog`, which extends nothing, so the claim that it is a `CardStore` (REQ-2) is
refuted. The committed Surefire report says the test that cites REQ-2 passed: the refuted claim is masked danger, green
over refuted, and the only danger. Cucumber-JVM step definitions (an expression with `{int}`, an anchored regular
expression) match three of the scenario's four steps; `And the move is logged` matches none, a gap naming it, and
every definition is used. Analyse, danger and grain, sections 3 and 5; exit of stage 59.

The expected result was written from the documents before the fixture was first run.
