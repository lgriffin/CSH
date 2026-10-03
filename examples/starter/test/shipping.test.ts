// The starter's tests. Each asserts as usual; the probe records each call to shippingFee as a witness.
import assert from "node:assert/strict";
import { test } from "node:test";
import { probe } from "@csh/harness";
import { shippingFee } from "../src/shipping.ts";

const quote = probe("Quote", shippingFee, {
  pre: () => ({}),
  args: (orderTotal) => ({ orderTotal }),
  post: () => ({}),
  result: (fee) => fee,
  mocked: [],
});

test("an order of 60 euros ships free", (t) => {
  assert.equal(quote.in(t, { cites: ["SHIP-001"] })(60), 0);
});

test("an order of 20 euros pays 5 euros for shipping", (t) => {
  assert.equal(quote.in(t)(20), 5);
});
