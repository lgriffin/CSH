# F220

Snapshot entries in Python and Java ([21](../../docs/spec/21-test-suites-as-evidence.md), section 3; stage 74, A-269).

- `tests/__snapshots__/test_cart.ambr` is syrupy's. `test_total` and `test_total.1` name `test_total`, and
  `TestDiscount.test_ten_off[TENOFF]` names the method of the class, its parameters left off. `test_removed_line` names no
  test of `tests/test_cart.py`: `obsolete-snapshot`.
- `ReceiptTest.printsTotal.approved.txt` names the method `printsTotal` of `ReceiptTest`; `ReceiptTest.printsTax.approved.txt`
  names a method the class does not declare: `obsolete-snapshot`.

The expected result was written from the specification before the code.
