import { describe, expect, it } from "vitest";
import { computeTotal } from "./total.ts";

// priceLine is covered by the total.
describe("priceLine and the total", () => {
  it("adds every line", () => {
    expect(computeTotal([{ price: 2, quantity: 3 }, { price: 1, quantity: 1 }])).toBe(7);
  });
});
