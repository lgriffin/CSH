# F142

Prevention in Java ([14](../../docs/spec/14-assertion-ladder.md), section 4; stage 47). Three closed types:
`ShopException`, a sealed class whose subclasses are nested in it, with members `NotFound` and `Conflict`; `Shape`, a
sealed interface that `permits Circle, Square`; and `Status`, an enum of `OPEN` and `CLOSED`.

- `Handler` maps `ShopException` in a `switch` expression with a type pattern per member and no `default`: total over
  `ShopException`.
- `Areas` maps `Shape` the same way: total over `Shape`.
- `Labels` maps `Status` in a `switch` expression on its constants with no `default`: total over `Status`.
- `Fallback` maps `Status` with a `default`, which a new constant falls into: not total.
- `Legacy` switches over `Status` in an old-style statement with colons: Java does not demand that it be complete, so
  it is not total.

`R-J-1` is cited by the holding claim on `Handler`: L5. The claim on `Fallback` is refuted, and the claim on `Legacy`
too.

The expected result was written from the documents before the fixture was first run.
