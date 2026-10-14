import { expect, it } from "vitest";
import { move } from "../src/domain/board.ts";

it("REQ-1 keeps a card that moves", () => {
  expect(move(["a"], "a")).toBe(0);
});

it("REQ-2 the domain answers without the HTTP layer", () => {
  expect(move([], "a")).not.toBe(0);
});
