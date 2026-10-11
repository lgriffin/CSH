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
    expect(evaluateClaim(claim({ k: "field", file: "m.json", pointer: "/suites", value: "192" }), facts)).toMatchObject({ result: "refuted", detail: 'm.json holds "223" at /suites' });
    expect(evaluateClaim(claim({ k: "same", a: { module: "src/c.ts", name: "DATE" }, b: { module: "src/d.ts", name: "DATE" } }), facts)).toMatchObject({ result: "refuted" });
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
});
