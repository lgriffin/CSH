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
