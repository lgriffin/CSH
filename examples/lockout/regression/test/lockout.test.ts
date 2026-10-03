// The unit tests after a later change that edits the code and its test together, so both agree with each other
// and the suite stays green. This is the change the enforcing gate exists to stop.
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

test("allows a third failed attempt", (t) => {
  const { login: after, result } = signInProbe.in(t, { cites: ["LCK-001"] })({ failedAttempts: 2, locked: false, lockSeconds: 0 }, false);
  assert.equal(result, "Refused");
  assert.equal(after.failedAttempts, 3);
  assert.equal(after.locked, false);
});

test("refuses a wrong password on a locked account without counting it", (t) => {
  const { login: after, result } = signInProbe.in(t, { cites: ["LCK-002"] })({ failedAttempts: 3, locked: true, lockSeconds: 900 }, false);
  assert.equal(result, "Refused");
  assert.equal(after.failedAttempts, 3);
});

test("refuses a locked account even with the correct password", (t) => {
  const { login: after, result } = signInProbe.in(t, { cites: ["LCK-002"] })({ failedAttempts: 3, locked: true, lockSeconds: 900 }, true);
  assert.equal(result, "Refused");
  assert.equal(after.locked, true);
});

test("resets the count on a successful sign-in", (t) => {
  const { login: after, result } = signInProbe.in(t, { cites: ["LCK-003"] })({ failedAttempts: 2, locked: false, lockSeconds: 0 }, true);
  assert.equal(result, "Accepted");
  assert.equal(after.failedAttempts, 0);
});
