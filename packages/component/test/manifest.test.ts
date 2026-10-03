// The component manifest (Anchor, harnesses and A3, section 2.1): structural validation, the digest of its bytes, and
// the check against the emitted specification.
import { describe, expect, it } from "vitest";
import type { Module } from "@csh/kernel";
import { checkAgainstModule, type ComponentManifest, ownersOf, parseComponent, practiceOf, validateManifest } from "../src/index.ts";

const good: ComponentManifest = {
  schema: "csh-component/v1",
  name: "SignInService",
  spec: "spec.csl.ts",
  implementation: ["src"],
  practices: [
    { id: "ears", name: "EARS", kind: "requirements", sources: ["Product"] },
    { id: "tdd", name: "TDD", kind: "tests", sources: ["UnitTests"], cites: "Product", harness: { run: ["node", "--test"], witnesses: "inputs/witnesses.ndjson" } },
  ],
};

// Only the fields checkAgainstModule reads.
const signIn = { system: "SignInService", sources: [{ name: "Product", kind: "Requirements", at: "inputs/requirements.md" }, { name: "UnitTests", kind: "Witnesses", at: "inputs/witnesses.ndjson" }] } as unknown as Module;

const codes = (v: unknown) => validateManifest(v).map((p) => p.code);
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

describe("validateManifest", () => {
  it("accepts a well-formed manifest", () => {
    expect(validateManifest(good)).toEqual([]);
  });

  it("reports a wrong schema, a missing name and a path outside the root", () => {
    const problems = validateManifest({ ...good, schema: "csh-component/v0", name: "", spec: "../elsewhere.csl.ts" });
    expect(problems.map((p) => p.code)).toEqual(["malformed-manifest", "malformed-manifest", "malformed-manifest"]);
    expect(validateManifest({ ...good, implementation: ["/abs"] })[0]!.detail).toMatch(/implementation/);
  });

  it("reports a practice declared twice and a source owned by two practices", () => {
    expect(codes({ ...good, practices: [good.practices[0], good.practices[0]] })).toEqual(["duplicate-practice"]);
    expect(codes({ ...good, practices: [good.practices[0], { ...good.practices[1], sources: ["Product"] }] })).toEqual(["source-owned-twice"]);
  });

  it("allows steps for a scenarios practice only, and asks for an argument vector, never a shell string", () => {
    expect(codes({ ...good, practices: [{ ...good.practices[0], steps: "csh/steps.ts" }] })).toEqual(["malformed-manifest"]);
    expect(codes({ ...good, practices: [{ id: "bdd", name: "BDD", kind: "scenarios", sources: ["Scenarios"], steps: "csh/steps.ts" }] })).toEqual([]);
    expect(codes({ ...good, practices: [{ ...good.practices[1], harness: { run: "node --test", witnesses: "w.ndjson" } }] })).toEqual(["malformed-manifest"]);
  });

  it("refuses an empty practice list and a value that is not an object", () => {
    expect(codes({ ...good, practices: [] })).toEqual(["malformed-manifest"]);
    expect(codes([])).toEqual(["malformed-manifest"]);
  });
});

describe("parseComponent", () => {
  it("digests the file's bytes, so a change of formatting is a change of manifest", () => {
    const a = parseComponent(bytes(good));
    const b = parseComponent(new TextEncoder().encode(JSON.stringify(good, null, 2)));
    expect(a.problems).toEqual([]);
    expect(a.component!.digest).toMatch(/^sha256:/);
    expect(b.component!.digest).not.toBe(a.component!.digest);
  });

  it("reports text that is not JSON without throwing", () => {
    const r = parseComponent(new TextEncoder().encode("{ not json"));
    expect(r.component).toBeUndefined();
    expect(r.problems[0]!.code).toBe("malformed-manifest");
  });
});

describe("checkAgainstModule", () => {
  it("finds no errors and no unowned source when the manifest matches", () => {
    expect(checkAgainstModule(good, signIn)).toEqual({ errors: [], unowned: [] });
  });

  it("reports a name mismatch, an unknown source, an unknown cited source and a witness file no source reads", () => {
    const m: ComponentManifest = {
      ...good,
      name: "Other",
      practices: [
        { id: "ears", name: "EARS", kind: "requirements", sources: ["Product", "IntegrationTests"], cites: "Nowhere" },
        { id: "tdd", name: "TDD", kind: "tests", sources: ["UnitTests"], harness: { run: ["node"], witnesses: "reports/other.ndjson" } },
      ],
    };
    expect(checkAgainstModule(m, signIn).errors.map((e) => e.code)).toEqual(["component-name-mismatch", "practice-unknown-source", "practice-unknown-source", "harness-file-unread"]);
  });

  it("returns a source no practice names as unowned, not as an error", () => {
    const r = checkAgainstModule({ ...good, practices: [good.practices[0]!] }, signIn);
    expect(r).toEqual({ errors: [], unowned: ["UnitTests"] });
  });
});

describe("owners", () => {
  it("maps each source to its practice", () => {
    expect(ownersOf(good)).toEqual({ Product: "ears", UnitTests: "tdd" });
    expect(practiceOf(good, "UnitTests")!.id).toBe("tdd");
    expect(practiceOf(good, "Nothing")).toBeUndefined();
  });
});
