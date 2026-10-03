// Unit tests for the sign-in service, written before the code. Each test asserts as usual. A probe records
// each call to signIn as a witness for the harness; the witness states facts and asserts nothing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { probe } from "@csh/harness";
import { type Login, signIn } from "../src/lockout.ts";

// One probe for the event. The mappers are the only place that names witness keys; they are reviewed like bindings.
const signInProbe = probe("SignIn", signIn, {
  pre: (before: Login) => ({ ...before }),
  args: (_before, passwordOk) => ({ passwordOk }),
  post: (out) => ({ ...out.login }),
  result: (out) => out.result,
  mocked: [],
});

test("allows three failed attempts before locking", (t) => {
  const { login: after, result } = signInProbe.in(t)({ failedAttempts: 2, locked: false, lockSeconds: 0 }, false);
  assert.equal(result, "Refused");
  assert.equal(after.failedAttempts, 3);
  assert.equal(after.locked, false);
});

test("locks on the fourth failed attempt", (t) => {
  const { login: after, result } = signInProbe.in(t)({ failedAttempts: 3, locked: false, lockSeconds: 0 }, false);
  assert.equal(result, "Refused");
  assert.equal(after.locked, true);
  assert.equal(after.lockSeconds, 900);
});

test("refuses a locked account even with the correct password", (t) => {
  const { login: after, result } = signInProbe.in(t)({ failedAttempts: 4, locked: true, lockSeconds: 900 }, true);
  assert.equal(result, "Refused");
  assert.equal(after.locked, true);
});

test("resets the count on a successful sign-in", (t) => {
  const { login: after, result } = signInProbe.in(t)({ failedAttempts: 2, locked: false, lockSeconds: 0 }, true);
  assert.equal(result, "Accepted");
  assert.equal(after.failedAttempts, 0);
});
