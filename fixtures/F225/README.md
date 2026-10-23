# F225

What prose names, tests exercise, in Java and Rust ([21](../../docs/spec/21-test-suites-as-evidence.md), section 4;
stage 72, A-264).

- `docs/orders.md` names `parse_order` beside `orders/src/lib.rs`, and the integration test `orders/tests/parse.rs`
  calls it: `exercised`.
- `docs/shop.md` names `Basket` and `Receipt`. `BasketTest.java` uses `Basket`; `Receipt` is named only in its comment:
  `unexercised`.

The expected result was written from the specification before the code.
