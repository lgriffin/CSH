import { expect, it } from "vitest";
import { applyDiscount } from "./discount.ts";

it("takes ten percent off", () => {
  expect(applyDiscount(100, "TENOFF")).toBe(90);
});
