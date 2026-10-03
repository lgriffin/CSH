// Unit tests for the account service. Each test asserts as usual. A probe records each call to withdraw as a witness
// for the harness: it states facts and asserts nothing, and the test runner's reporter supplies each test's outcome.
import assert from "node:assert/strict";
import { test } from "node:test";
import { probe } from "@csh/harness";
import { type Account, withdraw } from "../src/account.ts";

const account = (a: Account) => ({ balanceMinor: a.balanceMinor, minimumBalanceMinor: a.minimumBalanceMinor });

// The mappers are the only place that names witness keys; they are reviewed like bindings.
const withdrawProbe = probe("Withdraw", withdraw, {
  pre: (before) => account(before),
  args: (_before, amount) => ({ amount }),
  post: (out) => account(out.account),
  result: (out) => out.result,
  mocked: [],
});

test("rejects a withdrawal below the floor", (t) => {
  const { account: after, result } = withdrawProbe.in(t)({ balanceMinor: 5000, minimumBalanceMinor: 0, premium: false }, 10000);
  assert.equal(result, "Rejected");
  assert.equal(after.balanceMinor, 5000);
});

test("accepts a withdrawal within the balance", (t) => {
  const { account: after, result } = withdrawProbe.in(t)({ balanceMinor: 5000, minimumBalanceMinor: 0, premium: false }, 3000);
  assert.equal(result, "Accepted");
  assert.equal(after.balanceMinor, 2000);
});

test("lets a premium account overdraw", (t) => {
  const { account: after, result } = withdrawProbe.in(t)({ balanceMinor: 5000, minimumBalanceMinor: 0, premium: true }, 10000);
  assert.equal(result, "Accepted");
  assert.equal(after.balanceMinor, -5000);
});
