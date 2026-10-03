import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWitness, outcomeOf, parseExecutions, parseWitnesses, recordWitness, validateWitness, type Witness, witnessDigest } from "../src/index.ts";

const base = (): Witness =>
  buildWitness(
    { event: "Withdraw", args: { amount: 30 }, pre: { balance: 100 }, post: { balance: 70 }, mocked: [], id: "w1", test: "withdraws" },
    { commit: "abc", environment: "test", now: () => new Date("2026-01-01T00:00:00Z") },
  );

describe("witness format", () => {
  it("builds a well-formed record", () => {
    const w = base();
    expect(validateWitness(w)).toBeUndefined();
    expect(w.execution.test).toBe("withdraws");
    expect(w.subject.commit).toBe("abc");
  });

  it("leaves recordedAt out of the digest", () => {
    const a = base();
    const b = { ...a, recordedAt: "2030-05-05T00:00:00Z" };
    expect(witnessDigest(a)).toBe(witnessDigest(b));
    expect(witnessDigest({ ...a, post: { balance: 71 } })).not.toBe(witnessDigest(a));
  });

  it("reports malformed lines and duplicate ids instead of dropping them", () => {
    const good = JSON.stringify(base());
    const text = [good, "{not json", JSON.stringify({ ...base(), schema: "other" }), good, ""].join("\n");
    const r = parseWitnesses(text);
    expect(r.witnesses.map((x) => x.line)).toEqual([1]);
    expect(r.problems.map((p) => p.line)).toEqual([2, 3, 4]);
    expect(r.problems[2]!.message).toMatch(/duplicate witness id/);
  });

  it.each([
    ["args with an object value", { args: { a: { b: 1 } } }, /args/],
    ["a bad local result", { execution: { localResult: "ok", mocked: [] } }, /execution/],
    ["no subject", { subject: null }, /subject/],
    ["an object result", { result: { x: 1 } }, /result/],
  ])("rejects %s", (_n, patch, msg) => {
    expect(validateWitness({ ...base(), ...patch })).toMatch(msg);
  });

  it("appends one line per record to the witness file", () => {
    const dir = mkdtempSync(join(tmpdir(), "csh-witness-"));
    try {
      const file = join(dir, "sub", "w.ndjson");
      recordWitness({ event: "E", args: {}, pre: {}, post: { x: 1 }, mocked: ["Db"] }, { file });
      recordWitness({ event: "E", args: {}, pre: {}, post: { x: 2 }, mocked: [] }, { file });
      const r = parseWitnesses(readFileSync(file, "utf8"));
      expect(r.problems).toEqual([]);
      expect(r.witnesses.map((x) => x.w.post.x)).toEqual([1, 2]);
      expect(r.witnesses[0]!.w.execution.mocked).toEqual(["Db"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes version 2 with no outcome unless one is given, and still reads version 1", () => {
    const w = base();
    expect(w.schema).toBe("csh-witness/v2");
    expect(outcomeOf(w)).toBe("unknown");
    expect(outcomeOf(buildWitness({ event: "E", args: {}, pre: {}, post: {}, mocked: [], localResult: "failed" }))).toBe("failed");
    const v1 = { ...w, schema: "csh-witness/v1", execution: { localResult: "passed", mocked: [] } };
    expect(validateWitness(v1)).toBeUndefined();
    expect(validateWitness({ ...v1, execution: { mocked: [] } })).toMatch(/version 1 needs localResult/);
    expect(validateWitness({ ...v1, cites: ["R-1"] })).toMatch(/cites needs csh-witness\/v2/);
    expect(validateWitness({ ...w, cites: ["R-1"] })).toBeUndefined();
    expect(validateWitness({ ...w, cites: [""] })).toMatch(/cites/);
  });

  it("parses execution lines and reports malformed ones", () => {
    const text = [JSON.stringify({ schema: "csh-execution/v1", test: "t::a", outcome: "passed" }), "x", JSON.stringify({ schema: "csh-execution/v1", test: "t::b", outcome: "skipped" })].join("\n");
    const r = parseExecutions(text);
    expect(r.executions.map((x) => [x.e.test, x.line])).toEqual([["t::a", 1]]);
    expect(r.problems.map((p) => p.line)).toEqual([2, 3]);
  });
});

