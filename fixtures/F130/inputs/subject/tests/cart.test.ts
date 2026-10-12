import { it, expect } from "vitest";
import { Cart } from "../src/cart.ts";

it("REQ-2 totals the cart", () => {
  expect(new Cart().total()).toBe(0);
});
