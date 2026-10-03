// Unit tests for the account service. Each test asserts as usual, and records what happened
// as a witness for the harness. The witness states facts; it asserts nothing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { recordWitness } from "@csh/witness";
import { type Account, withdraw } from "../src/account.ts";

function run(name: string, before: Account, amount: number) {
  const { account: after, result } = withdraw(before, amount);
  recordWitness({
    test: name,
    id: name.replace(/\s+/g, "-"),
    event: "Withdraw",
    args: { amount },
    pre: { balanceMinor: before.balanceMinor, minimumBalanceMinor: before.minimumBalanceMinor },
    post: { balanceMinor: after.balanceMinor, minimumBalanceMinor: after.minimumBalanceMinor },
    result,
    mocked: [],
  });
  return { after, result };
}

test("rejects a withdrawal below the floor", () => {
  const { after, result } = run("rejects below floor", { balanceMinor: 5000, minimumBalanceMinor: 0, premium: false }, 10000);
  assert.equal(result, "Rejected");
  assert.equal(after.balanceMinor, 5000);
});

test("accepts a withdrawal within the balance", () => {
  const { after, result } = run("accepts within balance", { balanceMinor: 5000, minimumBalanceMinor: 0, premium: false }, 3000);
  assert.equal(result, "Accepted");
  assert.equal(after.balanceMinor, 2000);
});

test("lets a premium account overdraw", () => {
  const { after, result } = run("premium overdraw", { balanceMinor: 5000, minimumBalanceMinor: 0, premium: true }, 10000);
  assert.equal(result, "Accepted");
  assert.equal(after.balanceMinor, -5000);
});
