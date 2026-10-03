// Unit tests for the sign-in service after the countermeasures. Each test asserts as usual, and records
// what happened as a witness for the harness. The witness states facts; it asserts nothing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { recordWitness } from "@csh/witness";
import { type Login, signIn } from "../src/lockout.ts";

function run(id: string, before: Login, passwordOk: boolean) {
  const { login: after, result } = signIn(before, passwordOk);
  recordWitness({ test: id, id, event: "SignIn", args: { passwordOk }, pre: { ...before }, post: { ...after }, result, mocked: [] });
  return { after, result };
}

test("locks on the third failed attempt", () => {
  const { after, result } = run("locks-on-third", { failedAttempts: 2, locked: false, lockSeconds: 0 }, false);
  assert.equal(result, "Refused");
  assert.equal(after.failedAttempts, 3);
  assert.equal(after.locked, true);
  assert.equal(after.lockSeconds, 900);
});

test("refuses a wrong password on a locked account without counting it", () => {
  const { after, result } = run("refuses-wrong-when-locked", { failedAttempts: 3, locked: true, lockSeconds: 900 }, false);
  assert.equal(result, "Refused");
  assert.equal(after.failedAttempts, 3);
});

test("refuses a locked account even with the correct password", () => {
  const { after, result } = run("refuses-when-locked", { failedAttempts: 3, locked: true, lockSeconds: 900 }, true);
  assert.equal(result, "Refused");
  assert.equal(after.locked, true);
});

test("resets the count on a successful sign-in", () => {
  const { after, result } = run("resets-on-success", { failedAttempts: 2, locked: false, lockSeconds: 0 }, true);
  assert.equal(result, "Accepted");
  assert.equal(after.failedAttempts, 0);
});
