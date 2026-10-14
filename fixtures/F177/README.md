# F177

The Go case, over embedded structs. `AuditedStore` embeds `*MemoryStore`, so the claim that it is a `MemoryStore`
(REQ-1) holds; `CachedStore` embeds nothing, so the claim that it is one (REQ-2) is refuted. The committed
`go test -json` events say the test that cites REQ-2 passed: the refuted claim is masked danger, green over refuted,
and the only danger. godog step definitions (`ctx.Step` and `ctx.Then` with regular expressions in raw strings) match
three of the scenario's four steps; `And the move is logged` matches none, a gap naming it, and every definition is
used. Analyse, danger and grain, sections 3 and 5; exit of stage 59.

The expected result was written from the documents before the fixture was first run.
