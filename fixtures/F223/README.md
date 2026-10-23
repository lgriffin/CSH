# F223

What prose names, tests exercise, in TypeScript ([21](../../docs/spec/21-test-suites-as-evidence.md), section 4;
stage 72, A-264 and A-265).

- `docs/pricing.md` names `applyDiscount` beside its file, and `src/cart/discount.test.ts` calls it: `exercised`.
- The cart's own document names `computeTotal`, `priceLine` and `applyDiscount`. A test calls `computeTotal` and
  `applyDiscount`; `priceLine` is named only in a comment and a test title, which are not code: `unexercised`.
- REQ-1 writes `computeTotal`, which a test mentions, so its `unverified` gap names that test as one that could cite
  it. REQ-2 writes `priceLine`, which no test's code mentions, so its gap names none.

The expected result was written from the specification before the code.
