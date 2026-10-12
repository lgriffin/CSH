import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { ArchRule } from "@csh/kernel";
import { type ArchDiagram, type ArchFacts, conflictingRelations, containersOf, evaluateRule, sameName, selects, undrawnDependencies, unobservedRelations, unplacedPackages } from "../src/index.ts";

const diagram: ArchDiagram = {
  elements: [
    { id: "web", packages: ["web", "ui"], span: "c.mmd:2" },
    { id: "core", packages: ["core"], span: "c.mmd:3" },
    { id: "db", packages: ["db"], span: "c.mmd:4" },
    { id: "user", packages: [], span: "c.mmd:5" },
  ],
  relations: [
    { from: "web", to: "core", span: "c.mmd:6" },
    { from: "web", to: "db", span: "c.mmd:7" },
    { from: "user", to: "web", span: "c.mmd:8" },
  ],
};
const dep = (from: string, to: string, at = "x.ts:1", typeOnly = false) => ({ from, to, at, typeOnly, via: "import" });
const facts = (depends: ReturnType<typeof dep>[]): ArchFacts => ({ packages: ["@s/web", "@s/ui", "@s/core", "@s/db"], depends });

describe("selectors", () => {
  it("match a package by its full name or the name after its scope", () => {
    expect(sameName("@csh/kernel", "kernel")).toBe(true);
    expect(sameName("kernel", "@other/kernel")).toBe(true);
    expect(sameName("@csh/kernel-x", "kernel")).toBe(false);
    expect(selects({ k: "package", name: "kernel" }, "@csh/kernel", undefined)).toBe(true);
    expect(selects({ k: "container", id: "web" }, "@s/ui", diagram)).toBe(true);
    expect(selects({ k: "container", id: "web" }, "@s/core", diagram)).toBe(false);
    expect(containersOf(diagram, "@s/ui")).toEqual(["web"]);
  });
});

describe("module selectors (stage 23)", () => {
  it("select source files by glob, with exceptions, and need no diagram", () => {
    const sel = { k: "modules" as const, globs: ["src/core/**"], except: ["src/core/ports/**"] };
    expect(selects(sel, "src/core/a.ts", undefined)).toBe(true);
    expect(selects(sel, "src/core/ports/p.ts", undefined)).toBe(false);
    expect(selects(sel, "src/clients/c.ts", undefined)).toBe(false);
    expect(selects({ k: "modules", globs: ["node:*"] }, "node:fs", undefined)).toBe(true);
    const rule: ArchRule = { k: "forbid", from: sel, to: { k: "modules", globs: ["src/clients/**"] } };
    const files = { packages: [], depends: [dep("src/core/a.ts", "src/clients/c.ts", "src/core/a.ts:3"), dep("src/core/ports/p.ts", "src/clients/c.ts"), dep("src/clients/c.ts", "src/core/a.ts")] };
    expect(evaluateRule(rule, files, undefined)).toEqual({ result: "violated", by: [dep("src/core/a.ts", "src/clients/c.ts", "src/core/a.ts:3")] });
    const only: ArchRule = { k: "only", from: { k: "modules", globs: ["src/sde/**"] }, to: [{ k: "modules", globs: ["node:*"] }, { k: "package", name: "zod" }] };
    expect(evaluateRule(only, { packages: [], depends: [dep("src/sde/a.ts", "src/sde/b.ts"), dep("src/sde/a.ts", "node:fs"), dep("src/sde/a.ts", "zod")] }, undefined).result).toBe("holds");
    expect(evaluateRule(only, { packages: [], depends: [dep("src/sde/a.ts", "src/core/x.ts")] }, undefined).result).toBe("violated");
  });

  it("a file the rule selects but no reader read leaves a rule unknown, never satisfied (stage 29)", () => {
    const rule: ArchRule = { k: "forbid", from: { k: "modules", globs: ["app/domain/**"] }, to: { k: "modules", globs: ["app/adapters/**"] } };
    const unread = ["app/domain/model.kt", "lib/other.kt"];
    expect(evaluateRule(rule, { packages: [], depends: [], unread }, undefined)).toEqual({ result: "unknown", reason: "not-read: app/domain/model.kt" });
    // What was read can still violate it, and an unread file the rule does not select changes nothing.
    expect(evaluateRule(rule, { packages: [], depends: [dep("app/domain/a.ts", "app/adapters/b.ts")], unread }, undefined).result).toBe("violated");
    expect(evaluateRule({ ...rule, from: { k: "modules", globs: ["src/**"] } }, { packages: [], depends: [], unread }, undefined).result).toBe("holds");
  });
});

describe("rules against facts", () => {
  it("forbid is violated by each dependency it names, with its file and line", () => {
    const r = evaluateRule({ k: "forbid", from: { k: "package", name: "core" }, to: { k: "container", id: "web" } }, facts([dep("@s/core", "@s/ui", "core.ts:2"), dep("@s/web", "@s/core")]), diagram);
    expect(r).toEqual({ result: "violated", by: [dep("@s/core", "@s/ui", "core.ts:2")] });
  });
  it("only allows the listed packages and the selection itself", () => {
    const rule: ArchRule = { k: "only", from: { k: "container", id: "web" }, to: [{ k: "package", name: "core" }] };
    expect(evaluateRule(rule, facts([dep("@s/web", "@s/ui"), dep("@s/web", "@s/core")]), diagram).result).toBe("holds");
    expect(evaluateRule(rule, facts([dep("@s/ui", "@s/db")]), diagram).result).toBe("violated");
  });
  it("closed is violated by an undrawn dependency between containers", () => {
    const r = evaluateRule({ k: "closed", source: "C4" }, facts([dep("@s/core", "@s/db", "orders.ts:3")]), diagram);
    expect(r.result === "violated" && r.by.map((x) => x.at)).toEqual(["orders.ts:3"]);
  });
  it("a container the diagram lacks gives unknown", () => {
    expect(evaluateRule({ k: "forbid", from: { k: "container", id: "nowhere" }, to: { k: "any" } }, facts([]), diagram)).toEqual({ result: "unknown", reason: "unknown-container: nowhere" });
  });
  it("no dependency at all breaks no forbid rule (property)", () => {
    fc.assert(fc.property(fc.constantFrom("web", "core", "db"), fc.constantFrom("ui", "core", "db"), (a, b) => evaluateRule({ k: "forbid", from: { k: "package", name: a }, to: { k: "package", name: b } }, facts([]), diagram).result === "holds"));
  });
});

describe("the diagram against a rule and the facts", () => {
  it("conflicts only where each end is wholly inside what the rule names", () => {
    expect(conflictingRelations({ k: "forbid", from: { k: "container", id: "web" }, to: { k: "package", name: "db" } }, diagram).map((r) => `${r.from}->${r.to}`)).toEqual(["web->db"]);
    // ui alone is forbidden: the web arrow may be web's own dependency, so it is no conflict.
    expect(conflictingRelations({ k: "forbid", from: { k: "package", name: "ui" }, to: { k: "package", name: "db" } }, diagram)).toEqual([]);
    expect(conflictingRelations({ k: "only", from: { k: "container", id: "web" }, to: [{ k: "package", name: "core" }] }, diagram).map((r) => r.to)).toEqual(["db"]);
    expect(conflictingRelations({ k: "closed", source: "C4" }, diagram)).toEqual([]);
  });
  it("finds undrawn dependencies, unobserved relations and unplaced packages", () => {
    const f: ArchFacts = { packages: [...facts([]).packages, "@s/tools"], depends: [dep("@s/web", "@s/core"), dep("@s/core", "@s/db", "o.ts:3"), dep("@s/web", "@s/ui")] };
    expect([...undrawnDependencies(diagram, f).keys()]).toEqual(["core->db"]);
    expect(unobservedRelations(diagram, f).map((r) => `${r.from}->${r.to}`)).toEqual(["web->db"]);
    expect(unplacedPackages(diagram, f)).toEqual(["@s/tools"]);
  });
});

describe("a rule over nothing", () => {
  const modules = ["src/core/a.ts", "src/core/b.ts"];
  const facts = { packages: [], modules, depends: [dep("src/core/a.ts", "src/core/b.ts")] };

  it("is unknown, not held, when its subject selects no module read", () => {
    const typo: ArchRule = { k: "forbid", from: { k: "modules", globs: ["src/cor/**"] }, to: { k: "package", name: "pg" } };
    expect(evaluateRule(typo, facts, undefined)).toEqual({ result: "unknown", reason: "selects-nothing: modules(src/cor/**) matches none of 2 modules read" });
    const only: ArchRule = { k: "only", from: { k: "modules", globs: ["lib/**"] }, to: [] };
    expect(evaluateRule(only, facts, undefined).result).toBe("unknown");
  });

  it("holds when its subject exists and the thing it forbids is absent", () => {
    const rule: ArchRule = { k: "forbid", from: { k: "modules", globs: ["src/core/**"] }, to: { k: "package", name: "pg" } };
    expect(evaluateRule(rule, facts, undefined).result).toBe("holds");
  });

  it("is judged as before when the facts do not list their modules", () => {
    const rule: ArchRule = { k: "forbid", from: { k: "modules", globs: ["src/cor/**"] }, to: { k: "package", name: "pg" } };
    expect(evaluateRule(rule, { packages: [], depends: [] }, undefined).result).toBe("holds");
  });
});
