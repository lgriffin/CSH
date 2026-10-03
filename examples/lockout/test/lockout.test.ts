// Unit tests for the sign-in service, written before the code. Each test asserts as usual, and records
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

test("allows three failed attempts before locking", () => {
  const { after, result } = run("allows-three-failures", { failedAttempts: 2, locked: false, lockSeconds: 0 }, false);
  assert.equal(result, "Refused");
  assert.equal(after.failedAttempts, 3);
  assert.equal(after.locked, false);
});

test("locks on the fourth failed attempt", () => {
  const { after, result } = run("locks-on-fourth", { failedAttempts: 3, locked: false, lockSeconds: 0 }, false);
  assert.equal(result, "Refused");
  assert.equal(after.locked, true);
  assert.equal(after.lockSeconds, 900);
});

test("refuses a locked account even with the correct password", () => {
  const { after, result } = run("refuses-when-locked", { failedAttempts: 4, locked: true, lockSeconds: 900 }, true);
  assert.equal(result, "Refused");
  assert.equal(after.locked, true);
});

test("resets the count on a successful sign-in", () => {
  const { after, result } = run("resets-on-success", { failedAttempts: 2, locked: false, lockSeconds: 0 }, true);
  assert.equal(result, "Accepted");
  assert.equal(after.failedAttempts, 0);
});
