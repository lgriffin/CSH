// Dotted external names (What the Java and Python runs asked for, section 2; stage 45): a package covers its members,
// and a glob finer than what the facts record is unknown, never held.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forbid, modules, only, pkg } from "csl";
import { type ArchDependency, type ArchFacts, evaluateRule, selects } from "../src/index.ts";

const dep = (from: string, to: string, at = `${from}:1`): ArchDependency => ({ from, to, at, typeOnly: false, via: "import" });
/** Facts over files read; every other target is external. */
const facts = (depends: ArchDependency[], files: string[]): ArchFacts => ({ packages: [], modules: files, depends });

const UI = "src/main/java/demo/ui/Screen.java";
const CORE = "app/core/updater.py";

describe("a dotted name covers its members (A-171)", () => {
  it("selects java.sql with java.sql.* and java.sql.**, and not with a sibling or a prefix", () => {
    expect(selects(modules("java.sql.*"), "java.sql", undefined)).toBe(true);
    expect(selects(modules("java.sql.**"), "java.sql", undefined)).toBe(true);
    expect(selects(modules("java.sql.*"), "java.sqlx", undefined)).toBe(false);
    expect(selects(modules("java.sq*.*"), "java.sql", undefined)).toBe(false);
    expect(selects(modules("java.sql.*", { except: "java.sql.*" }), "java.sql", undefined)).toBe(false);
    expect(selects(modules("java.sql.*", { except: "java.sql" }), "java.sql", undefined)).toBe(false);
    expect(selects(pkg("java.sql.*"), "java.sql", undefined)).toBe(false);
  });
  it("never covers a path", () => {
    expect(selects(modules("src/a.*"), "src/a", undefined)).toBe(false);
  });
  it("makes a rule forbidding java.sql.* or PySide6.* violated, with the importing line", () => {
    const java = evaluateRule(forbid(modules("src/main/java/demo/ui/**"), modules("java.sql.*")), facts([dep(UI, "java.sql", `${UI}:3`)], [UI]), undefined);
    expect(java).toEqual({ result: "violated", by: [dep(UI, "java.sql", `${UI}:3`)] });
    const py = evaluateRule(forbid(modules("app/core/**"), modules("PySide6.*")), facts([dep(CORE, "PySide6")], [CORE]), undefined);
    expect(py.result).toBe("violated");
  });
  it("lets an only rule allow a package by its members", () => {
    expect(evaluateRule(only(modules("app/core/**"), [modules("python:os.*")]), facts([dep(CORE, "python:os")], [CORE]), undefined)).toEqual({ result: "holds" });
  });
});

describe("a glob finer than the facts (A-172)", () => {
  it("leaves a forbid unknown when a selected module depends on the package its target names part of", () => {
    const r = evaluateRule(forbid(modules("app/core/**"), modules("PySide6.QtWidgets")), facts([dep(CORE, "PySide6", `${CORE}:1`)], [CORE]), undefined);
    expect(r).toEqual({ result: "unknown", reason: `finer-than-facts: modules(PySide6.QtWidgets) names part of PySide6, which the facts record whole (${CORE}:1)` });
    const cls = evaluateRule(forbid(modules("src/main/java/demo/ui/**"), modules("java.sql.Connection")), facts([dep(UI, "java.sql", `${UI}:3`)], [UI]), undefined);
    expect(cls.result).toBe("unknown");
  });
  it("still holds a forbid when no selected module depends on that package, and still violates on another target", () => {
    expect(evaluateRule(forbid(modules("app/core/**"), modules("PySide6.QtWidgets")), facts([dep("app/gui/w.py", "PySide6")], [CORE, "app/gui/w.py"]), undefined).result).toBe("holds");
    const both = evaluateRule(forbid(modules("app/core/**"), modules(["PySide6.QtWidgets", "requests"])), facts([dep(CORE, "PySide6"), dep(CORE, "requests", `${CORE}:2`)], [CORE]), undefined);
    expect(both).toEqual({ result: "violated", by: [dep(CORE, "requests", `${CORE}:2`)] });
  });
  it("does not treat a module read as an external name", () => {
    const files = [CORE, "app.gui"];
    expect(evaluateRule(forbid(modules("app/core/**"), modules("app.gui.x")), facts([dep(CORE, "app.gui")], files), undefined).result).toBe("holds");
  });
  it("leaves an only unknown when its only offending dependencies are on packages an allowed glob refines", () => {
    const core = "src/main/java/demo/core/Order.java";
    const r = evaluateRule(only(modules("src/main/java/demo/core/**"), [modules("java.util.List")]), facts([dep(core, "java.util", `${core}:2`)], [core]), undefined);
    expect(r).toEqual({ result: "unknown", reason: `finer-than-facts: modules(java.util.List) names part of java.util, which the facts record whole (${core}:2)` });
    const other = evaluateRule(only(modules("src/main/java/demo/core/**"), [modules("java.util.List")]), facts([dep(core, "java.util"), dep(core, "java.sql", `${core}:3`)], [core]), undefined);
    expect(other).toEqual({ result: "violated", by: [dep(core, "java.sql", `${core}:3`)] });
  });
  it("never holds a forbid whose target refines a package a selected module depends on", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{1,6}(\.[a-z]{1,6}){0,2}$/), fc.stringMatching(/^[A-Za-z]{1,6}$/), (pkgName, member) => {
        const r = evaluateRule(forbid(modules("app/core/**"), modules(`${pkgName}.${member}`)), facts([dep(CORE, pkgName)], [CORE]), undefined);
        expect(r.result).not.toBe("holds");
      }),
    );
  });
});
