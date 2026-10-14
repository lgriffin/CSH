import { expect, it } from "vitest";
import { Lock } from "../src/lock.ts";

it("GRN-6 counts each failure", () => {
  const lock = new Lock();
  lock.fail();
  expect(lock.attempts).toBe(1);
});

it("GRN-1 locks after three failures", () => {
  const lock = new Lock();
  lock.fail();
  lock.fail();
  lock.fail();
  expect(lock.attempts).toBe(3);
  expect(lock.locked).toBe(true);
});
