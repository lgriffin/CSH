// Structural claims (stage 24): judged by lookup in the facts, never solved.
import { describe, expect, it } from "vitest";
import type { Claim, Prop } from "@csh/kernel";
import { claimConflict, type ClaimFacts, describeClaim, evaluateClaim, truthOf } from "../src/index.ts";

const facts: ClaimFacts = {
  modules: new Set(["src/err.ts", "src/index.ts", "src/c.ts", "src/d.ts", "src/star.ts"]),
  declares: [
    { module: "src/err.ts", symbol: "LibError", declares: "class", base: "Error", at: "src/err.ts:1" },
    { module: "src/err.ts", symbol: "NetError", declares: "class", base: "LibError", at: "src/err.ts:5" },
    { module: "src/err.ts", symbol: "OpenError", declares: "class", base: "NetError", at: "src/err.ts:9" },
    { module: "src/err.ts", symbol: "Odd", declares: "class", base: "Unseen", at: "src/err.ts:12" },
    { module: "src/c.ts", symbol: "DATE", declares: "const", value: "2026-08-18", at: "src/c.ts:1" },
    { module: "src/d.ts", symbol: "DATE", declares: "const", value: "2025-12-16", at: "src/d.ts:3" },
    { module: "src/d.ts", symbol: "NOW", declares: "const", at: "src/d.ts:4" },
  ],
  exports: [
    { module: "src/index.ts", symbol: "OpenError", at: "src/index.ts:1" },
    { module: "src/star.ts", symbol: "*", at: "src/star.ts:1" },
  ],
  fields: [
    { file: "package.json", path: "/exports/.", value: "./a.js", at: "package.json" },
    { file: "package.json", path: "/exports/.~1b/import", value: "./b.mjs", at: "package.json" },
    { file: "package.json", path: "/exports/.~1b/types", value: "./b.d.ts", at: "package.json" },
    { file: "package.json", path: "/exports/.~1package.json", value: "./package.json", at: "package.json" },
    { file: "package.json", path: "/scripts/gen:types", value: "x", at: "package.json" },
    { file: "m.json", path: "/suites", value: "223", at: "m.json" },
  ],
  files: new Set(["package.json", ".github/CODEOWNERS"]),
};
const claim = (p: Prop, holds = true): Claim => ({ k: "claim", holds, p });

describe("structural claims", () => {
  it("follow a chain of bases through the declared classes", () => {
    expect(evaluateClaim(claim({ k: "inherits", cls: "OpenError", base: "LibError" }), facts)).toMatchObject({ result: "holds" });
    expect(evaluateClaim(claim({ k: "inherits", cls: "OpenError", base: "LibError" }, false), facts)).toMatchObject({ result: "refuted", detail: expect.stringContaining("OpenError (src/err.ts:9) -> NetError") });
    expect(evaluateClaim(claim({ k: "inherits", cls: "NetError", base: "TypeError" }), facts)).toMatchObject({ result: "refuted", detail: expect.stringContaining("ends at Error") });
    expect(truthOf({ k: "inherits", cls: "Odd", base: "Error" }, facts)).toEqual({ reason: "base-not-read: Unseen" });
    expect(truthOf({ k: "inherits", cls: "Ghost", base: "Error" }, facts)).toEqual({ reason: "no-class: Ghost" });
  });

  it("follow a chain through the built-in classes of the language that extends them (stage 29)", () => {
    const decl = (module: string, symbol: string, base: string) => ({ module, symbol, declares: "class", base, at: `${module}:1` });
    const poly: ClaimFacts = {
      modules: new Set(["app/errors.py", "src/Err.java", "src/err.ts"]),
      declares: [decl("app/errors.py", "BadInput", "ValueError"), decl("src/Err.java", "Boom", "RuntimeException"), decl("src/err.ts", "Wrapped", "Exception")],
      exports: [],
      fields: [],
      languages: new Map([
        ["app/errors.py", "python"],
        ["src/Err.java", "java"],
      ]),
    };
    expect(truthOf({ k: "inherits", cls: "BadInput", base: "Exception" }, poly)).toMatchObject({ value: true, detail: "BadInput (app/errors.py:1) -> ValueError -> Exception" });
    expect(truthOf({ k: "inherits", cls: "BadInput", base: "LookupError" }, poly)).toMatchObject({ value: false, detail: expect.stringContaining("ends at ValueError -> Exception -> BaseException -> object") });
    expect(truthOf({ k: "inherits", cls: "Boom", base: "Throwable" }, poly)).toMatchObject({ value: true });
    // A TypeScript class extending a name that is built in only to Python or Java extends an unread class.
    expect(truthOf({ k: "inherits", cls: "Wrapped", base: "Error" }, poly)).toEqual({ reason: "base-not-read: Exception" });
  });

  it("leave a claim unknown when the fact that would decide it was not read", () => {
    expect(evaluateClaim(claim({ k: "exports", module: "src/other.ts", symbol: "x" }, false), facts)).toEqual({ result: "unknown", reason: "not-read: src/other.ts" });
    expect(evaluateClaim(claim({ k: "exports", module: "src/star.ts", symbol: "x" }, false), facts)).toMatchObject({ result: "unknown", reason: expect.stringContaining("star-export") });
    expect(evaluateClaim(claim({ k: "file", path: "x" }), (({ files: _, ...rest }) => rest)(facts))).toEqual({ result: "unknown", reason: "no-tracked-files" });
    expect(evaluateClaim(claim({ k: "atom", name: "SBOM published" }), facts)).toMatchObject({ result: "unknown" });
    expect(truthOf({ k: "same", a: { module: "src/c.ts", name: "DATE" }, b: { module: "src/d.ts", name: "NOW" } }, facts)).toEqual({ reason: "not-a-literal: src/d.ts:4" });
  });

  it("refute a claim the facts contradict, and say what was found", () => {
    expect(evaluateClaim(claim({ k: "exports", module: "src/index.ts", symbol: "OpenError" }, false), facts)).toMatchObject({ result: "refuted", detail: "src/index.ts:1: src/index.ts exports OpenError" });
    expect(evaluateClaim(claim({ k: "count", file: "package.json", pointer: "/exports", n: 2, except: ["./package.json"] }), facts)).toMatchObject({ result: "holds" });
    expect(evaluateClaim(claim({ k: "count", file: "package.json", pointer: "/exports", n: 1, except: ["./package.json"] }), facts)).toMatchObject({ result: "refuted", detail: "package.json has 2 entries at /exports less ./package.json" });
    // The evidence names where the result was decided, for history to date (stage 25): a field by its value.
    expect(evaluateClaim(claim({ k: "field", file: "m.json", pointer: "/suites", value: "192" }), facts)).toMatchObject({ result: "refuted", detail: 'm.json holds "223" at /suites', evidence: [{ at: "m.json", text: "223" }] });
    expect(evaluateClaim(claim({ k: "same", a: { module: "src/c.ts", name: "DATE" }, b: { module: "src/d.ts", name: "DATE" } }), facts)).toMatchObject({ result: "refuted", evidence: [{ at: expect.stringMatching(/^src\/c\.ts:\d+$/) }, { at: expect.stringMatching(/^src\/d\.ts:\d+$/) }] });
    expect(evaluateClaim(claim({ k: "script", name: "gen:types" }), facts)).toMatchObject({ result: "holds" });
    expect(evaluateClaim(claim({ k: "file", path: ".github/CODEOWNERS" }, false), facts)).toMatchObject({ result: "refuted" });
  });

  it("find two claims in conflict whatever the facts say", () => {
    const six = claim({ k: "count", file: "package.json", pointer: "/exports", n: 6 });
    const seven = claim({ k: "count", file: "package.json", pointer: "/exports", n: 7 });
    expect(claimConflict(six, seven)).toBe("one says package.json /exports has 6 entries, the other package.json /exports has 7 entries");
    expect(claimConflict(six, claim({ k: "count", file: "package.json", pointer: "/exports", n: 6 }, false))).toBeDefined();
    expect(claimConflict(six, claim({ k: "count", file: "package.json", pointer: "/exports", n: 7 }, false))).toBeUndefined();
    const inh = claim({ k: "inherits", cls: "A", base: "B" });
    expect(claimConflict(inh, claim({ k: "inherits", cls: "A", base: "B" }, false))).toBeDefined();
    expect(claimConflict(inh, claim({ k: "inherits", cls: "A", base: "C" }, false))).toBeUndefined();
    expect(describeClaim(claim({ k: "file", path: "x" }, false))).toBe("not: x exists");
  });

  it("say unknown, not false, where a fact could be missing because it was not read", () => {
    const pkg: ClaimFacts = { ...facts, fields: [{ file: "package.json", path: "/name", value: "p", at: "package.json" }, { file: "x.json", path: "/a/empty", value: "{}", at: "x.json" }, { file: "x.json", path: "/a/b", value: "1", at: "x.json" }] };
    expect(truthOf({ k: "field", file: "package.json", pointer: "/private", value: "true" }, pkg)).toEqual({ reason: "not-read: package.json /private" });
    expect(truthOf({ k: "count", file: "package.json", pointer: "/exports", n: 0 }, pkg)).toEqual({ reason: "not-read: package.json /exports" });
    expect(truthOf({ k: "count", file: "x.json", pointer: "/a", n: 2 }, pkg)).toMatchObject({ value: true });
    expect(truthOf({ k: "count", file: "x.json", pointer: "/a/empty", n: 0 }, pkg)).toMatchObject({ value: true });
  });

  it("follow no class whose name is declared twice, or whose base is qualified", () => {
    const dup: ClaimFacts = { ...facts, declares: [...facts.declares, { module: "src/other.ts", symbol: "NetError", declares: "class", base: "LibError", at: "src/other.ts:1" }, { module: "src/q.ts", symbol: "Q", declares: "class", base: "ns.LibError", at: "src/q.ts:1" }] };
    expect(truthOf({ k: "inherits", cls: "OpenError", base: "LibError" }, dup)).toEqual({ reason: "ambiguous-class: NetError is declared 2 times" });
    expect(truthOf({ k: "inherits", cls: "Q", base: "Error" }, dup)).toEqual({ reason: "qualified-base: Q extends ns.LibError" });
  });

  it("find equality claims in conflict whichever way round their constants are written", () => {
    const a = { module: "src/c.ts", name: "DATE" };
    const b = { module: "src/d.ts", name: "DATE" };
    expect(claimConflict(claim({ k: "same", a, b }), claim({ k: "same", a: b, b: a }, false))).toBeDefined();
  });
  it("follow Python classes as the Python reader declares them (stage 31)", () => {
    // The declare facts facts-py writes for `class DomainError(Exception)`, `class NotFound(DomainError)`,
    // `class Repo(Generic[T])`, `class Adapter(abc.ABC)` and `class Plain:`.
    const py: ClaimFacts = {
      modules: new Set(["src/app/errors.py"]),
      declares: [
        { module: "src/app/errors.py", symbol: "DomainError", declares: "class", base: "Exception", at: "src/app/errors.py:1" },
        { module: "src/app/errors.py", symbol: "NotFound", declares: "class", base: "DomainError", at: "src/app/errors.py:4" },
        { module: "src/app/errors.py", symbol: "Repo", declares: "class", base: "Generic[T]", at: "src/app/errors.py:7" },
        { module: "src/app/errors.py", symbol: "Adapter", declares: "class", base: "abc.ABC", at: "src/app/errors.py:9" },
        { module: "src/app/errors.py", symbol: "Plain", declares: "class", at: "src/app/errors.py:11" },
      ],
      exports: [],
      fields: [],
      languages: new Map([["src/app/errors.py", "python"]]),
    };
    expect(evaluateClaim(claim({ k: "inherits", cls: "NotFound", base: "DomainError" }), py)).toMatchObject({ result: "holds", detail: "NotFound (src/app/errors.py:4) -> DomainError" });
    expect(evaluateClaim(claim({ k: "inherits", cls: "NotFound", base: "Exception" }), py)).toMatchObject({ result: "holds" });
    expect(evaluateClaim(claim({ k: "inherits", cls: "NotFound", base: "ValueError" }), py)).toMatchObject({ result: "refuted", detail: expect.stringContaining("ends at Exception") });
    expect(evaluateClaim(claim({ k: "inherits", cls: "Plain", base: "DomainError" }), py)).toMatchObject({ result: "refuted", detail: expect.stringContaining("extends nothing") });
    expect(truthOf({ k: "inherits", cls: "Repo", base: "Base" }, py)).toEqual({ reason: "qualified-base: Repo extends Generic[T]" });
    expect(truthOf({ k: "inherits", cls: "Adapter", base: "Base" }, py)).toEqual({ reason: "qualified-base: Adapter extends abc.ABC" });
  });
});
