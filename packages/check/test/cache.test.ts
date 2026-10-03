import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFakeSolver, type CheckInput, type CheckResult } from "@csh/solver";
import { cachingSolver, SolverCache } from "../src/index.ts";

const input = (n: number): CheckInput => ({ vocabulary: { units: [], enums: [], states: [], events: [] }, hard: [{ op: "const", v: n % 2 === 0 }], tracked: [], timeoutMs: 100 });

describe("solver cache", () => {
  it("stores sat and unsat answers and replays them", async () => {
    let calls = 0;
    const cache = new SolverCache();
    const s = cachingSolver(createFakeSolver(() => (calls++, { status: "unsat", core: [] } as CheckResult)), cache);
    await s.check(input(0));
    await s.check(input(0));
    expect(calls).toBe(1);
    expect(cache.hits).toBe(1);
    await s.check(input(1));
    expect(calls).toBe(2);
  });

  it("never stores an unknown answer", async () => {
    const cache = new SolverCache();
    const s = cachingSolver(createFakeSolver("timeout"), cache);
    await s.check(input(0));
    await s.check(input(0));
    expect(cache.entries.size).toBe(0);
    expect(cache.misses).toBe(2);
  });

  it("survives a save and load", async () => {
    const dir = mkdtempSync(join(tmpdir(), "csh-cache-"));
    try {
      const cache = new SolverCache();
      await cachingSolver(createFakeSolver(() => ({ status: "sat", model: { x: "1" } })), cache).check(input(0));
      cache.save(join(dir, "c.json"));
      const back = SolverCache.load(join(dir, "c.json"));
      const r = await cachingSolver(createFakeSolver("crash"), back).check(input(0));
      expect(r).toEqual({ status: "sat", model: { x: "1" } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
