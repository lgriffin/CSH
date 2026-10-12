// Rules the real runs could not state (From real runs, section 2; stage 39): chains, value imports, cycles, counts of
// modules and a target that selects nothing.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ArchRule, ArchSel } from "@csh/kernel";
import { isArchRule, isProp } from "@csh/kernel";
import { acyclic, count, forbid, modules, only } from "csl";
import { type ArchDependency, type ArchFacts, claimConflict, evaluateClaim, evaluateRule } from "../src/index.ts";

const dep = (from: string, to: string, at = `${from}:1`, typeOnly = false): ArchDependency => ({ from, to, at, typeOnly, via: "import" });
const facts = (depends: ArchDependency[], extra: Partial<ArchFacts> = {}): ArchFacts => ({ packages: [], modules: [...new Set(depends.flatMap((d) => [d.from, d.to]))], depends, ...extra });

describe("forbid with reaches", () => {
  const chain = [dep("pods/p.ts", "core/s.ts"), dep("core/s.ts", "db/c.ts"), dep("core/s.ts", "core/t.ts"), dep("core/t.ts", "db/c.ts")];
  it("is violated by a chain no single import shows, and names the shortest one step by step", () => {
    const rule = forbid(modules("pods/**"), modules("db/**"), { reaches: true });
    const r = evaluateRule(rule, facts(chain), undefined);
    expect(r.result).toBe("violated");
    if (r.result !== "violated") return;
    expect(r.chains).toEqual([[chain[0], chain[1]]]);
    expect(evaluateRule(forbid(modules("pods/**"), modules("db/**")), facts(chain), undefined).result).toBe("holds");
  });
  it("is unknown, not held, when the only way on is through a module that was not read", () => {
    const r = evaluateRule(forbid(modules("pods/**"), modules("db/**"), { reaches: true }), facts([dep("pods/p.ts", "gen/x.py")], { unread: ["gen/x.py"] }), undefined);
    expect(r).toEqual({ result: "unknown", reason: "not-read: gen/x.py" });
  });
  it("does not loop on a cycle and finds nothing where there is nothing", () => {
    const r = evaluateRule(forbid(modules("a/**"), modules("db/**"), { reaches: true }), facts([dep("a/x.ts", "b/y.ts"), dep("b/y.ts", "a/x.ts"), dep("db/c.ts", "a/x.ts")]), undefined);
    expect(r.result).toBe("holds");
  });
  it("agrees with reachability by a fixed point, on random graphs", () => {
    const nodes = ["a/0", "a/1", "m/2", "m/3", "m/4", "z/5"];
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 })), { maxLength: 14 }), (pairs) => {
        const deps = pairs.map(([x, y]) => dep(nodes[x]!, nodes[y]!));
        const reach = new Set(nodes.filter((n) => n.startsWith("a/")));
        for (let changed = true; changed; ) {
          changed = false;
          for (const d of deps) if (reach.has(d.from) && !reach.has(d.to)) changed = reach.add(d.to) !== undefined;
        }
        // Only a step away from a start counts: a start reaching itself is no dependency on z.
        const expected = deps.some((d) => d.from !== d.to) && [...reach].some((n) => n.startsWith("z/") && deps.some((d) => d.to === n && d.from !== n));
        const r = evaluateRule(forbid(modules("a/**"), modules("z/**"), { reaches: true }), facts(deps, { modules: nodes }), undefined);
        expect(r.result === "violated").toBe(expected);
        if (r.result === "violated") for (const c of r.chains!) for (let i = 1; i < c.length; i++) expect(c[i]!.from).toBe(c[i - 1]!.to);
      }),
    );
  });
});

describe("values: true", () => {
  const deps = [dep("web/a.ts", "core/s.ts", "web/a.ts:1", true), dep("web/b.ts", "core/f.ts", "web/b.ts:2")];
  it("counts only dependencies that import a value, when the selector is the subject", () => {
    const r = evaluateRule(forbid(modules("web/**", { values: true }), modules("core/**")), facts(deps), undefined);
    expect(r).toEqual({ result: "violated", by: [deps[1]] });
    expect(evaluateRule(forbid(modules("web/a.ts", { values: true }), modules("core/**")), facts(deps), undefined).result).toBe("holds");
    expect(evaluateRule(only(modules("web/a.ts", { values: true }), []), facts(deps), undefined).result).toBe("holds");
  });
  it("is part of the selector, and only of a modules selector", () => {
    expect(modules("web/**", { values: true })).toEqual({ k: "modules", globs: ["web/**"], values: true });
    expect(modules("web/**", { values: false })).toEqual({ k: "modules", globs: ["web/**"] });
    expect(isArchRule(forbid(modules("web/**", { values: true }), modules("core/**")))).toBe(true);
    expect(isArchRule({ k: "forbid", from: { k: "modules", globs: ["w"], values: false }, to: { k: "any" } })).toBe(false);
  });
});

describe("acyclic", () => {
  it("names each cycle once, from its least member", () => {
    const deps = [dep("b.ts", "c.ts"), dep("c.ts", "a.ts"), dep("a.ts", "b.ts"), dep("d.ts", "a.ts"), dep("e.ts", "f.ts"), dep("f.ts", "e.ts")];
    const r = evaluateRule(acyclic(modules("**")), facts(deps), undefined);
    expect(r.result).toBe("violated");
    if (r.result !== "violated") return;
    expect(r.chains!.map((c) => c.map((x) => x.from))).toEqual([["a.ts", "b.ts", "c.ts"], ["e.ts", "f.ts"]]);
  });
  it("with a group, counts only cycles between the directories the glob matches", () => {
    const deps = [dep("packages/a/src/x.ts", "packages/a/src/y.ts"), dep("packages/a/src/y.ts", "packages/a/src/x.ts"), dep("packages/a/src/x.ts", "packages/b/src/z.ts"), dep("packages/b/src/z.ts", "packages/c/src/w.ts")];
    expect(evaluateRule(acyclic(modules("packages/**"), { group: "packages/*" }), facts(deps), undefined).result).toBe("holds");
    const r = evaluateRule(acyclic(modules("packages/**"), { group: "packages/*" }), facts([...deps, dep("packages/c/src/w.ts", "packages/a/src/y.ts", "packages/c/src/w.ts:9")]), undefined);
    expect(r.result === "violated" && r.chains!.map((c) => c.map((x) => x.at))).toEqual([["packages/a/src/x.ts:1", "packages/b/src/z.ts:1", "packages/c/src/w.ts:9"]]);
  });
  it("is unknown when its selector selects nothing read, and not held over an unread module", () => {
    expect(evaluateRule(acyclic(modules("nowhere/**")), facts([dep("a.ts", "b.ts")]), undefined)).toMatchObject({ result: "unknown" });
    expect(evaluateRule(acyclic(modules("**")), facts([dep("a.ts", "b.ts")], { unread: ["c.py"] }), undefined)).toEqual({ result: "unknown", reason: "not-read: c.py" });
  });
  it("finds a cycle exactly when the graph has one, on random graphs", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 })), { maxLength: 12 }), (pairs) => {
        const deps = pairs.filter(([x, y]) => x !== y).map(([x, y]) => dep(`m${x}`, `m${y}`));
        // A graph is acyclic when repeatedly removing nodes with no outgoing edge empties it.
        let left = new Set(deps.flatMap((d) => [d.from, d.to]));
        for (;;) {
          const sinks = [...left].filter((n) => !deps.some((d) => d.from === n && left.has(d.to)));
          if (sinks.length === 0) break;
          left = new Set([...left].filter((n) => !sinks.includes(n)));
        }
        const r = evaluateRule(acyclic(modules("m*")), facts(deps), undefined);
        expect(r.result === "violated").toBe(left.size > 0);
        if (r.result === "violated") for (const c of r.chains!) expect(c.at(-1)!.to).toBe(c[0]!.from);
      }),
    );
  });
});

describe("a forbid target that selects nothing", () => {
  it("holds, and says its target selects nothing", () => {
    const r = evaluateRule(forbid(modules("core/**"), modules("pakages/**")), facts([dep("core/a.ts", "core/b.ts")]), undefined);
    expect(r).toEqual({ result: "holds", notes: ["target-selects-nothing: modules(pakages/**) matches no module, package or dependency of the facts"] });
    expect(evaluateRule(forbid(modules("core/**"), modules("core/b.ts")), facts([dep("core/a.ts", "x/c.ts")], { modules: ["core/a.ts", "core/b.ts"] }), undefined)).toEqual({ result: "holds" });
  });
});

describe("count over modules", () => {
  const claimFacts = { modules: new Set(["uc/a.ts", "uc/b.ts", "uc/c.ts", "uc/x/d.ts"]), declares: [], exports: [], fields: [] };
  const claim = (sel: ArchSel, n: number, holds = true) => ({ k: "claim" as const, holds, p: count(sel, n) });
  it("counts the modules read that the selector selects", () => {
    expect(evaluateClaim(claim(modules("uc/*.ts"), 3), claimFacts)).toEqual({ result: "holds", detail: "3 modules match modules(uc/*.ts)" });
    expect(evaluateClaim(claim(modules("uc/**", { except: "uc/x/**" }), 10), claimFacts)).toEqual({ result: "refuted", detail: "3 modules match modules(uc/**) less uc/x/**" });
    expect(evaluateClaim(claim(modules("uc/*"), 3), { ...claimFacts, unread: ["uc/e.py"] })).toEqual({ result: "unknown", reason: "not-read: uc/e.py" });
  });
  it("puts two counts of one selector in conflict, as two counts of a pointer are", () => {
    expect(claimConflict(claim(modules("uc/*.ts"), 3), claim(modules("uc/*.ts"), 10))).toMatch(/selects 3 modules/);
    expect(claimConflict(claim(modules("uc/*.ts"), 3), claim(modules("uc/*.ts"), 4, false))).toBeUndefined();
    expect(claimConflict(claim(modules("uc/*.ts"), 3), claim(modules("other/*.ts"), 10))).toBeUndefined();
  });
  it("is a proposition only over a modules selector", () => {
    expect(isProp(count(modules("uc/*.ts"), 3))).toBe(true);
    expect(() => count({ k: "any" }, 3)).toThrow(/modules/);
    expect(isProp({ k: "count-modules", globs: [], n: 1 })).toBe(false);
  });
});

describe("rule shapes", () => {
  it("accepts reaches and acyclic and refuses what they do not take", () => {
    const ok: ArchRule[] = [forbid(modules("a/**"), modules("b/**"), { reaches: true }), acyclic(modules("**")), acyclic(modules("**"), { group: "packages/*" })];
    for (const r of ok) expect(isArchRule(r)).toBe(true);
    expect(isArchRule({ k: "forbid", from: { k: "any" }, to: { k: "any" }, reaches: false })).toBe(false);
    expect(isArchRule({ k: "acyclic", within: { k: "any" }, group: "" })).toBe(false);
    expect(isArchRule({ k: "acyclic", within: { k: "any" }, extra: 1 })).toBe(false);
  });
});
