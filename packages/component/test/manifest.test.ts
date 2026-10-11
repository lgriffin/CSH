// The component manifest (Anchor, harnesses and A3, section 2.1): structural validation, the digest of its bytes, and
// the check against the emitted specification.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Module } from "@csh/kernel";
import { checkAgainstModule, type ComponentManifest, moduleOfManifest, ownersOf, parseComponent, practiceOf, validateManifest, withDeclaredSources } from "../src/index.ts";

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

  it("takes a harness timeout only as a positive whole number of milliseconds (#20)", () => {
    const withTimeout = (timeoutMs: unknown) => codes({ ...good, practices: [good.practices[0], { ...good.practices[1], harness: { run: ["node"], witnesses: "inputs/witnesses.ndjson", timeoutMs } }] });
    expect(withTimeout(1000)).toEqual([]);
    for (const bad of [0, -1, 1.5, "1000", null]) expect(withTimeout(bad), String(bad)).toEqual(["malformed-manifest"]);
  });

  it("takes a practice's own executions file only without a harness (#22)", () => {
    expect(codes({ ...good, practices: [good.practices[0], { id: "tdd", name: "TDD", kind: "tests", sources: ["UnitTests"], executions: "reports/executions.ndjson" }] })).toEqual([]);
    expect(codes({ ...good, practices: [good.practices[0], { ...good.practices[1], executions: "reports/executions.ndjson" }] })).toEqual(["malformed-manifest"]);
    expect(codes({ ...good, practices: [good.practices[0], { id: "tdd", name: "TDD", kind: "tests", sources: ["UnitTests"], executions: "../x" }] })).toEqual(["malformed-manifest"]);
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

  it("accepts a witness file inside a directory source, or spelt another way", () => {
    const at = (at: string, witnesses: string) => checkAgainstModule({ ...good, practices: [good.practices[0]!, { ...good.practices[1]!, harness: { run: ["node"], witnesses } }] }, { ...signIn, sources: [signIn.sources[0]!, { ...signIn.sources[1]!, at }] } as Module).errors.map((e) => e.code);
    expect(at("inputs", "inputs/witnesses.ndjson")).toEqual([]);
    expect(at("./inputs/", "inputs/witnesses.ndjson")).toEqual([]);
    expect(at("inputs/witnesses.ndjson", "./inputs/witnesses.ndjson")).toEqual([]);
    expect(at("input", "inputs/witnesses.ndjson")).toEqual(["harness-file-unread"]);
  });

  it("never reads a source that is a file as a directory holding the witness file", () => {
    const root = mkdtempSync(join(tmpdir(), "csh-manifest-"));
    try {
      mkdirSync(join(root, "inputs"));
      writeFileSync(join(root, "inputs", "witnesses.ndjson"), "");
      const m = { ...good, practices: [good.practices[0]!, { ...good.practices[1]!, harness: { run: ["node"], witnesses: "inputs/witnesses.ndjson/out.ndjson" } }] };
      expect(checkAgainstModule(m, signIn, root).errors.map((e) => e.code)).toEqual(["harness-file-unread"]);
      const dir = { ...signIn, sources: [signIn.sources[0]!, { ...signIn.sources[1]!, at: "inputs" }] } as Module;
      expect(checkAgainstModule({ ...m, practices: [good.practices[0]!, { ...good.practices[1]!, harness: { run: ["node"], witnesses: "inputs/witnesses.ndjson" } }] }, dir, root).errors).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns a source no practice names as unowned, not as an error", () => {
    const r = checkAgainstModule({ ...good, practices: [good.practices[0]!] }, signIn);
    expect(r).toEqual({ errors: [], unowned: ["UnitTests"] });
  });
});

// Version 2 (Ingesting a codebase, stage 21): a subject evaluated from outside, and a component with no specification.
const profile: ComponentManifest = {
  schema: "csh-component/v2",
  name: "ESI.ts",
  subject: { repo: "https://github.com/lgriffin/ESI.ts", commit: "2a2da8a626821bef77ad8726da2c8018e2961236" },
  implementation: ["src"],
  sources: [
    { name: "Charter", kind: "Requirements", at: "guides/CHARTER.md" },
    { name: "Features", kind: "Scenarios", at: "tests/bdd/features" },
  ],
  practices: [
    { id: "charter", name: "Charter", kind: "requirements", sources: ["Charter"] },
    { id: "bdd", name: "BDD", kind: "scenarios", sources: ["Features"] },
  ],
};

describe("version 2", () => {
  it("accepts a subject profile with no specification, and keeps version 1 unchanged", () => {
    expect(validateManifest(profile)).toEqual([]);
    expect(validateManifest({ ...good, schema: "csh-component/v2" })).toEqual([]);
  });

  it("refuses subject and sources in version 1, and a version 2 component with neither spec nor sources", () => {
    expect(codes({ ...good, subject: profile.subject })).toEqual(["malformed-manifest"]);
    const { sources: _s, ...bare } = profile;
    expect(validateManifest(bare)[0]!.detail).toMatch(/declares its sources/);
  });

  it("refuses a short commit, a duplicate source and a harness on a subject", () => {
    expect(validateManifest({ ...profile, subject: { ...profile.subject!, commit: "2a2da8a" } })[0]!.detail).toMatch(/full commit/);
    expect(codes({ ...profile, sources: [profile.sources![0], profile.sources![0]] })).toEqual(["duplicate-source"]);
    expect(codes({ ...profile, practices: [{ ...profile.practices[0]!, harness: { run: ["npm", "test"], witnesses: "w.ndjson" } }, profile.practices[1]] })).toEqual(["harness-on-subject"]);
  });

  it("takes globs on a declared source and string settings on a practice (stage 22)", () => {
    const globbed = { ...profile, sources: [{ ...profile.sources![0]!, include: ["**/*.md"], exclude: ["CHARTER.md"] }, profile.sources![1]!] };
    expect(validateManifest({ ...globbed, practices: [{ ...profile.practices[0]!, kind: "documents", settings: { headingFields: "form,status" } }, profile.practices[1]] })).toEqual([]);
    expect(codes({ ...profile, sources: [{ ...profile.sources![0]!, include: "**/*.md" }, profile.sources![1]] })).toEqual(["malformed-manifest"]);
    expect(codes({ ...profile, practices: [{ ...profile.practices[0]!, settings: { n: 1 } }, profile.practices[1]] })).toEqual(["malformed-manifest"]);
  });

  it("takes history with a tag or commit to start from, and refuses it in version 1 or with a start git would read as an option (stage 25)", () => {
    expect(validateManifest({ ...profile, history: {} })).toEqual([]);
    expect(validateManifest({ ...profile, history: { since: "v11.2.0" } })).toEqual([]);
    expect(validateManifest({ ...profile, history: { since: "previous-tag" } })).toEqual([]);
    expect(codes({ ...profile, history: { since: "--all" } })).toEqual(["malformed-manifest"]);
    expect(codes({ ...profile, history: true })).toEqual(["malformed-manifest"]);
    expect(codes({ ...good, history: {} })).toEqual(["malformed-manifest"]);
  });

  it("adds the sources the manifest declares to a specification's, and refuses a name both declare (stage 23)", () => {
    expect(validateManifest({ ...profile, spec: "spec.csl.ts" })).toEqual([]);
    const spec = { ...moduleOfManifest({ ...profile, sources: [{ name: "Rules", kind: "Requirements", at: "r.md" }] }) };
    const joined = withDeclaredSources(profile, spec);
    expect(joined.errors).toEqual([]);
    expect(joined.module.sources.map((x) => x.name)).toEqual(["Charter", "Features", "Rules"]);
    // The same name, kind and location only narrows the specification's source (stage 24); a different one is refused.
    expect(withDeclaredSources(profile, moduleOfManifest(profile)).errors).toEqual([]);
    const moved = { ...profile, sources: [{ ...profile.sources![0]!, at: "guides/OTHER.md" }, { ...profile.sources![1]!, kind: "Features" }] };
    expect(withDeclaredSources(moved, moduleOfManifest(profile)).errors.map((e) => e.code)).toEqual(["duplicate-source", "duplicate-source"]);
    expect(withDeclaredSources({ ...profile, sources: [] }, spec).module).toBe(spec);
  });

  it("makes the model of a component with no specification from its manifest alone", () => {
    const m = moduleOfManifest(profile);
    expect(m.system).toBe("ESI.ts");
    expect(m.sources.map((x) => x.name)).toEqual(["Charter", "Features"]);
    expect(m.intents).toEqual([]);
    expect(checkAgainstModule(profile, m)).toEqual({ errors: [], unowned: [] });
    expect(checkAgainstModule({ ...profile, practices: [profile.practices[0]!, { ...profile.practices[1]!, sources: ["Nothing"] }] }, m).errors.map((e) => e.code)).toEqual(["practice-unknown-source"]);
  });
});

describe("owners", () => {
  it("maps each source to its practice", () => {
    expect(ownersOf(good)).toEqual({ Product: "ears", UnitTests: "tdd" });
    expect(practiceOf(good, "UnitTests")!.id).toBe("tdd");
    expect(practiceOf(good, "Nothing")).toBeUndefined();
  });
});
