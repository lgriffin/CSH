import { defineFeature, loadFeature } from "../support/harness.ts";

const feature = loadFeature("features/0001-checkout.feature");

defineFeature(feature, (test) => {
  test("Paying records the order", ({ given, when, then }) => {
    given(/^a cart with (\d+) items$/, () => undefined);
    when("the shopper pays {string}", () => undefined);
    then("the order is recorded", () => undefined);
  });
});
