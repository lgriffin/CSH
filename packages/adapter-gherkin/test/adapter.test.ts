// The scenario adapter (Anchor, harnesses and A3, section 3.3): the project's step table lifts scenarios as examples;
// an unknown step keeps the scenario whole as unliftable; tags cite the source the practice names.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { digestOf, type Vocabulary } from "@csh/kernel";
import type { AdapterInput } from "@csh/witness";
import { exampleName, parse, readConversions, readStepTable, run, runWith, type StepDefinition } from "../src/index.ts";

const vocabulary: Vocabulary = {
  units: [{ name: "count" } as never, { name: "time" } as never],
  enums: [{ name: "Outcome", members: ["Accepted", "Refused"] } as never],
  states: [{ name: "Login", fields: { failures: { kind: "int", unit: "count(attempts)" }, locked: { kind: "bool" }, lockSeconds: { kind: "int", unit: "time(s)" } } }],
  events: [{ name: "SignIn", on: "Login", args: { passwordOk: { kind: "bool" } }, returns: { kind: "enum", enum: "Outcome" } }],
};

const bindings: AdapterInput["bindings"] = [
  { target: { k: "field", state: "Login", field: "failures" }, key: "failedAttempts", authority: "approved" },
  { target: { k: "field", state: "Login", field: "locked" }, key: "locked", authority: "approved" },
  { target: { k: "field", state: "Login", field: "lockSeconds" }, key: "lockSeconds", authority: "candidate" },
  { target: { k: "arg", event: "SignIn", name: "passwordOk" }, key: "passwordOk", authority: "approved" },
  { target: { k: "result", event: "SignIn" }, key: "result", authority: "approved" },
];

const steps: StepDefinition[] = [
  { keyword: "Given", pattern: /^the account has (\d+) failed attempts?$/, effects: (m) => [{ part: "pre", key: "failedAttempts", value: { k: "int", v: m[1]!, unit: "count(attempts)" } }] },
  { keyword: "Given", pattern: /^the account is (not )?locked$/, effects: (m) => [{ part: "pre", key: "locked", value: { k: "bool", v: m[1] === undefined } }] },
  { keyword: "When", pattern: /^the user signs in with the (correct|wrong) password$/, effects: (m) => [{ part: "args", key: "passwordOk", value: { k: "bool", v: m[1] === "correct" } }] },
  { keyword: "Then", pattern: /^the sign-in is (accepted|refused)$/, effects: (m) => [{ part: "result", key: "result", value: { k: "enum", member: m[1] === "accepted" ? "Accepted" : "Refused" } }] },
  { keyword: "Then", pattern: /^the account is locked for (\d+) minutes$/, effects: (m) => [{ part: "post", key: "lockSeconds", value: { k: "int", v: m[1]!, unit: "time(min)" } }] },
  { keyword: "Then", pattern: /^the account is (not )?locked$/, effects: (m) => [{ part: "post", key: "locked", value: { k: "bool", v: m[1] === undefined } }] },
];

const FEATURE = `Feature: Sign-in lockout

  @LCK-001
  Scenario: Third failed attempt locks the account
    Given the account has 2 failed attempts
    And the account is not locked
    When the user signs in with the wrong password
    Then the sign-in is refused
    And the account is locked

  Scenario: Support unlocks a locked account
    Given the account is locked
    When a support agent unlocks the account
    Then the sign-in is accepted

  Scenario Outline: Many attempts
    Given the account has <n> failed attempts
    Examples:
      | n |
      | 1 |

  Scenario: Lock lasts fifteen minutes
    Given the account has 2 failed attempts
    When the user signs in with the wrong password
    Then the account is locked for 15 minutes
`;

function input(files: Record<string, string>, config?: Record<string, string>): AdapterInput {
  const i: AdapterInput = {
    source: { name: "Scenarios", kind: "Scenarios", at: "features" },
    vocabulary,
    bindings,
    files: Object.entries(files).map(([path, text]) => {
      const bytes = new TextEncoder().encode(text);
      return { path, digest: digestOf(bytes), bytes };
    }),
  };
  if (config !== undefined) i.config = config;
  return i;
}

describe("runWith", () => {
  it("lifts a scenario through the step table and cites its tag in the source the practice names", () => {
    const out = runWith(input({ "features/lockout.feature": FEATURE }, { cites: "Product" }), { steps });
    const ex = out.claims!.examples.find((e) => e.name === "ScenarioThirdFailedAttemptLocksTheAccount")!;
    expect(ex.given).toEqual({ failures: { k: "int", v: "2", unit: "count(attempts)" }, locked: { k: "bool", v: false } });
    expect(ex.cites).toEqual([{ source: "Product", id: "LCK-001" }]);
  });

  it("keeps a scenario with an unknown step whole, with that step's span, and an outline as unsupported", () => {
    const out = runWith(input({ "features/lockout.feature": FEATURE }, { cites: "Product" }), { steps });
    expect(out.claims!.unliftable.map((u) => [u.span, u.reason])).toEqual([
      ["features/lockout.feature:13", "unknown-step"],
      ["features/lockout.feature:16", "unsupported-construct"],
    ]);
  });

  it("keeps the unit a scenario wrote unless the source records a conversion", () => {
    const plain = runWith(input({ "features/lockout.feature": FEATURE }), { steps }).claims!.examples.find((e) => e.name === "ScenarioLockLastsFifteenMinutes")!;
    expect(JSON.stringify(plain.then)).toContain('"unit":"time(min)"');
    const converted = runWith(input({ "features/lockout.feature": FEATURE, "features/units.json": '{ "time(min)": { "to": "time(s)", "factor": 60 } }' }), { steps }).claims!.examples.find((e) => e.name === "ScenarioLockLastsFifteenMinutes")!;
    expect(JSON.stringify(converted.then)).toContain('"v":"900","unit":"time(s)"');
  });

  it("reports a tag it cannot cite when no practice names the cited source", () => {
    const out = runWith(input({ "features/lockout.feature": FEATURE }), { steps });
    expect(out.claims!.examples.find((e) => e.name === "ScenarioThirdFailedAttemptLocksTheAccount")!.cites).toBeUndefined();
    expect(out.diagnostics.map((d) => d.code)).toContain("citation-without-source");
  });

  it("matches a global or sticky pattern from the start of each step, every time", () => {
    const flagged = steps.map((d) => ({ ...d, pattern: new RegExp(d.pattern.source, d.keyword === "Given" ? "g" : "y") }));
    const plain = runWith(input({ "features/lockout.feature": FEATURE }, { cites: "Product" }), { steps }).claims!.examples;
    const out = runWith(input({ "features/lockout.feature": FEATURE + FEATURE.replace("Feature: Sign-in lockout", "Feature: Again").replaceAll("Scenario: ", "Scenario: Again ") }, { cites: "Product" }), { steps: flagged });
    expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(out.claims!.examples.length).toBe(plain.length * 2);
  });

  it("needs the table to name the event when the vocabulary declares several", () => {
    const two = { ...vocabulary, events: [...vocabulary.events, { name: "Unlock", on: "Login", args: {} }] } as Vocabulary;
    const out = runWith({ ...input({ "features/lockout.feature": FEATURE }), vocabulary: two }, { steps });
    expect(out.diagnostics.map((d) => d.code)).toContain("event-unnamed");
    const named = runWith({ ...input({ "features/lockout.feature": FEATURE }), vocabulary: two }, { steps, event: "SignIn" });
    expect(named.claims!.examples.length).toBeGreaterThan(0);
  });
});

describe("the step table", () => {
  it("refuses a module without a well-formed table", () => {
    expect(readStepTable({}).problem).toMatch(/export steps/);
    expect(readStepTable({ steps: [{ keyword: "Given", pattern: "text", effects: () => [] }] }).problem).toMatch(/steps\[0\]/);
    expect(readStepTable({ steps, event: 3 }).problem).toMatch(/event/);
    expect(readStepTable({ steps }).table?.steps).toHaveLength(steps.length);
  });

  describe("loaded from the project", () => {
    let dir: string;
    beforeAll(() => {
      const base = resolve(import.meta.dirname, "../../../.csh-cache");
      mkdirSync(base, { recursive: true });
      dir = mkdtempSync(join(base, "gherkin-"));
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("imports the file the practice names, and reports a missing or broken one", async () => {
      const file = join(dir, "steps.ts");
      writeFileSync(file, `export const steps = [{ keyword: "Given", pattern: /^the account is (not )?locked$/, effects: (m: RegExpExecArray) => [{ part: "pre", key: "locked", value: { k: "bool", v: m[1] === undefined } }] }, { keyword: "Then", pattern: /^the sign-in is (accepted|refused)$/, effects: (m: RegExpExecArray) => [{ part: "result", key: "result", value: { k: "enum", member: m[1] === "accepted" ? "Accepted" : "Refused" } }] }];\n`);
      const text = "Feature: x\n  Scenario: Locked is refused\n    Given the account is locked\n    Then the sign-in is refused\n";
      const ok = await run(input({ "a.feature": text }, { steps: pathToFileURL(file).href }));
      expect(ok.claims!.examples.map((e) => e.name)).toEqual(["ScenarioLockedIsRefused"]);
      const none = await run(input({ "a.feature": text }));
      expect(none.diagnostics.map((d) => d.code)).toEqual(["no-step-table"]);
      const broken = await run(input({ "a.feature": text }, { steps: pathToFileURL(join(dir, "missing.ts")).href }));
      expect(broken.diagnostics.map((d) => d.code)).toEqual(["malformed-step-table"]);
    });
  });
});

describe("parsing", () => {
  it("names examples after scenario titles and continues And with the keyword before it", () => {
    expect(exampleName("Third failed attempt, locks!")).toBe("ScenarioThirdFailedAttemptLocks");
    const [first] = parse(FEATURE).scenarios;
    expect(first!.steps.map((s) => s.keyword)).toEqual(["Given", "Given", "When", "Then", "Then"]);
    expect(first!.tags).toEqual(["@LCK-001"]);
  });

  it("keeps the good conversions and reports the bad ones", () => {
    const diagnostics: { code: string }[] = [];
    expect(readConversions({ "time(min)": { to: "time(s)", factor: 60 }, bad: { to: 1 } }, "units.json", diagnostics as never)).toEqual({ "time(min)": { to: "time(s)", factor: 60 } });
    expect(diagnostics.map((d) => d.code)).toEqual(["malformed-units"]);
  });
});
