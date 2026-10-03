import { describe, expect, it } from "vitest";
import { digestOf, type Vocabulary } from "@csh/kernel";
import { type AdapterInput, buildWitness, type Witness } from "@csh/witness";
import { exampleName, liftValue, run } from "../src/index.ts";

const vocabulary: Vocabulary = {
  units: [{ name: "USD" } as never],
  enums: [{ name: "Outcome", members: ["Ok", "Refused"] } as never],
  states: [{ name: "Account", fields: { balance: { kind: "int", unit: "USD" }, frozen: { kind: "bool" } } }],
  events: [{ name: "Withdraw", on: "Account", args: { amount: { kind: "int", unit: "USD" } }, returns: { kind: "enum", enum: "Outcome" } }],
};

const bindings: AdapterInput["bindings"] = [
  { target: { k: "field", state: "Account", field: "balance" }, key: "balance", authority: "approved" },
  { target: { k: "field", state: "Account", field: "frozen" }, key: "frozen", authority: "candidate" },
  { target: { k: "arg", event: "Withdraw", name: "amount" }, key: "amount", authority: "approved" },
  { target: { k: "result", event: "Withdraw" }, key: "result", authority: "approved" },
];

const w = (id: string, patch: Partial<Witness> = {}): Witness => ({
  ...buildWitness({ event: "Withdraw", args: { amount: 30 }, pre: { balance: 100 }, post: { balance: 70 }, result: "Ok", mocked: [], id }, { commit: "c", environment: "t", now: () => new Date(0) }),
  ...patch,
});

function input(files: Record<string, Witness[] | string>): AdapterInput {
  return {
    source: { name: "Tests", kind: "Witnesses", at: "w.ndjson" },
    vocabulary,
    bindings,
    files: Object.entries(files).map(([path, c]) => {
      const text = typeof c === "string" ? c : c.map((x) => JSON.stringify(x)).join("\n");
      const bytes = new TextEncoder().encode(text);
      return { path, digest: digestOf(bytes), bytes };
    }),
  };
}

describe("witness-files adapter", () => {
  it("lifts a passing record as an example through reversed bindings", () => {
    const out = run(input({ "a.ndjson": [w("w1")] }));
    expect(out.witnesses).toHaveLength(1);
    expect(out.claims!.examples).toHaveLength(1);
    const ex = out.claims!.examples[0]!;
    expect(ex.name).toBe("WitnessW1");
    expect(ex.given.balance).toEqual({ k: "int", v: "100", unit: "USD" });
    expect(ex.args.amount).toEqual({ k: "int", v: "30", unit: "USD" });
    expect(out.witnessSpans!.w1).toBe("a.ndjson:1");
  });

  it("keeps a failing record as a witness but lifts no claim from it", () => {
    const out = run(input({ "a.ndjson": [w("w1", { execution: { localResult: "failed", mocked: [] } })] }));
    expect(out.witnesses).toHaveLength(1);
    expect(out.claims!.examples).toHaveLength(0);
  });

  it("reports unknown keys, non-integers and malformed lines as unliftable, never dropping them", () => {
    const text = [JSON.stringify(w("w1", { pre: { owner: "x" } })), JSON.stringify(w("w2", { pre: { balance: 1.5 } })), "garbage"].join("\n");
    const out = run(input({ "a.ndjson": text }));
    expect(out.claims!.unliftable.map((u) => [u.span, u.reason])).toEqual([
      ["a.ndjson:3", "malformed"],
      ["a.ndjson:1", "unknown-term"],
      ["a.ndjson:2", "value-not-integer"],
    ]);
    expect(out.diagnostics.some((d) => d.code === "malformed-witness")).toBe(true);
  });

  it("notes an example that depends on a candidate binding", () => {
    const out = run(input({ "a.ndjson": [w("w1", { pre: { balance: 100, frozen: false } })] }));
    expect(out.diagnostics.map((d) => d.code)).toContain("depends-on-candidate-binding");
  });

  it("flags duplicate example names", () => {
    const out = run(input({ "a.ndjson": [w("w-1")], "b.ndjson": [w("w.1")] }));
    expect(out.claims!.examples).toHaveLength(1);
    expect(out.claims!.unliftable.map((u) => u.reason)).toEqual(["duplicate-name"]);
  });

  it("is deterministic regardless of file order", () => {
    const a = run(input({ "a.ndjson": [w("w1")], "b.ndjson": [w("w2")] }));
    const b = run(input({ "b.ndjson": [w("w2")], "a.ndjson": [w("w1")] }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("types values strictly", () => {
    expect(liftValue("12", { kind: "int" })).toEqual({ ok: true, value: { k: "int", v: "12" } });
    expect(liftValue("012", { kind: "int" }).ok).toBe(false);
    expect(liftValue(2 ** 60, { kind: "int" }).ok).toBe(false);
    expect(liftValue(1, { kind: "bool" }).ok).toBe(false);
    expect(exampleName("deposit-then-withdraw_2")).toBe("WitnessDepositThenWithdraw2");
  });
});
