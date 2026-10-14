# F178

The Rust case, over supertraits. `Store: Reader + Writer`, so the claim that `Store` is a `Writer` (REQ-1) holds through
its second supertrait; `Cache: Reader`, and `Reader` has none, so the claim that `Cache` is a `Writer` (REQ-2) is
refuted. The committed cargo-nextest JUnit report says the test that cites REQ-2 passed: the refuted claim is masked
danger, green over refuted, and the only danger. cucumber-rs step definitions (`expr =`, `regex =` and a plain string)
match three of the scenario's four steps; `And the move is logged` matches none, a gap naming it, and every definition
is used. Analyse, danger and grain, sections 3 and 5; exit of stage 59.

The expected result was written from the documents before the fixture was first run.
