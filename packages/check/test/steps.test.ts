// Scenario steps matched to step definitions (From real runs, stage 42).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Module } from "@csh/kernel";
import { prepare, type SourceRun } from "../src/index.ts";
import { cucumberExpression, stepGaps, vitestExpression } from "../src/steps.ts";

describe("Cucumber expressions", () => {
  it("reads parameters, optional text and alternatives", () => {
    const m = (e: string, s: string) => cucumberExpression(e).test(s);
    expect(m("I have {int} cucumber(s)", "I have 1 cucumber")).toBe(true);
    expect(m("I have {int} cucumber(s)", "I have 12 cucumbers")).toBe(true);
    expect(m("I have {int} cucumber(s)", "I have one cucumber")).toBe(false);
    expect(m("the {string} button", 'the "Pay" button')).toBe(true);
    expect(m("the {word} costs {float}", "the pear costs 1.5")).toBe(true);
    expect(m("a red/green/blue ball", "a green ball")).toBe(true);
    expect(m("a red/green/blue ball", "a pink ball")).toBe(false);
    expect(m("{} happens", "anything at all happens")).toBe(true);
    expect(m("costs \\(net\\) {int}", "costs (net) 3")).toBe(true);
    expect(m("a.b", "axb")).toBe(false);
  });

  it("matches any literal text as itself", () => {
    fc.assert(fc.property(fc.string({ unit: fc.constantFrom("a", " ", ".", "*", "?", "[", "$", "^", "|") }), (t) => cucumberExpression(t).test(t)));
  });
});

const module: Module = { schema: "csh-ir/v1", system: "S", uses: [], vocabulary: { units: [], enums: [], states: [], events: [] }, transitions: [], policies: [], intents: [], sources: [], claims: [], bindings: [] };
const runs = (defs: string): SourceRun[] => [
  { source: "F", kind: "Features", files: [], output: { diagnostics: [], edges: [], items: [{ id: "f#/s", kind: "scenario", text: "s", span: "f.feature:3", textDigest: "sha256:0", attrs: { steps: "4\ta paid order\n5\tthe shopper asks for a refund" } }] } },
  { source: "T", kind: "TestFiles", files: [], output: { diagnostics: [], edges: [], items: [{ id: "s.ts", kind: "test-file", text: "s.ts", span: "s.ts:1", textDigest: "sha256:0", attrs: { tests: "0", stepDefinitions: defs } }] } },
];

describe("step gaps", () => {
  it("reports an undefined step and an unused definition", () => {
    const gaps = stepGaps(prepare(module, runs("1\texpression\ta paid order\n2\tregex\t/^the order is refunded$\n3\texpression\t{int} items")));
    expect(gaps.map((g) => [g.kind, g.subject])).toEqual([
      ["undefined-step", "F/f#/s"],
      ["unused-step-definition", "T/s.ts"],
    ]);
    expect(gaps[0]!.detail).toContain('f.feature:5 "the shopper asks for a refund"');
    expect(gaps[1]!.detail).toBe('no scenario step uses s.ts:2 /^the order is refunded$/; s.ts:3 "{int} items"');
  });

  it("decides nothing about an unmatched step while a definition cannot be read", () => {
    const gaps = stepGaps(prepare(module, runs("1\texpression\ta paid order\n2\tunreadable\tthe ${x} asks")));
    expect(gaps.map((g) => g.kind)).toEqual(["steps-undecided"]);
    expect(gaps[0]!.detail).toContain("s.ts:2 the ${x} asks");
  });

  it("says nothing when the run reads no definitions", () => {
    expect(stepGaps(prepare(module, runs("")))).toEqual([]);
  });
});

describe("vitest-cucumber expressions (From the tutors run, section 4)", () => {
  const m = (e: string, s: string) => vitestExpression(e).test(s);
  it("reads its parameters and keeps every other character literal", () => {
    expect(m("the SLO file committed at release/slo.yaml", "the SLO file committed at release/slo.yaml")).toBe(true);
    expect(m("the SLO file committed at release/slo.yaml", "the SLO file committed at release")).toBe(false);
    expect(m("{number} objectives are listed", "3 objectives are listed")).toBe(true);
    expect(m("{number} objectives are listed", "three objectives are listed")).toBe(false);
    expect(m("generator {string} wrote", 'generator "4.1.0" wrote')).toBe(true);
    expect(m("the flag is {boolean}", "the flag is true")).toBe(true);
    expect(m("the flag is {boolean}", "the flag is maybe")).toBe(false);
    expect(m("a cucumber(s)", "a cucumbers")).toBe(false);
    expect(m("a cucumber(s)", "a cucumber(s)")).toBe(true);
    expect(m('generator "<release>" wrote', 'generator "<release>" wrote')).toBe(true);
    expect(m("days {list}", "days a, b")).toBe(true);
  });

  it("matches any literal text with no braces as itself", () => {
    fc.assert(fc.property(fc.string({ unit: fc.constantFrom("a", " ", ".", "*", "?", "[", "$", "^", "|", "/", "(", ")", "<", ">") }), (t) => vitestExpression(t).test(t)));
  });
});

describe("outline templates and title binding (From the tutors run, sections 2 and 4)", () => {
  const scenario = (attrs: Record<string, string>, text = "s") => ({ source: "F", kind: "Features", files: [], output: { diagnostics: [], edges: [], items: [{ id: "f#/s", kind: "scenario" as const, text, span: "f.feature:3", textDigest: "sha256:0", attrs }] } });
  const steps = (defs: string, extra: Record<string, string> = {}) => ({ source: "T", kind: "TestFiles", files: [], output: { diagnostics: [], edges: [], items: [{ id: "t.steps.ts", kind: "test-file" as const, text: "t.steps.ts", span: "t.steps.ts:1", textDigest: "sha256:0", attrs: { tests: "0", stepDefinitions: defs, ...extra } }] } });
  it("matches an outline's step as written when its expansion matches nothing", () => {
    const p = prepare(module, [scenario({ steps: "4\tthe course \"4.1.0\" loads\n4\tthe course \"5.0.0\" loads", templates: "4\tthe course \"<release>\" loads" }), steps('9\tvitest\tthe course "<release>" loads')]);
    expect(stepGaps(p)).toEqual([]);
  });
  it("binds a scenario a test carries the title of, and still counts the definitions it matches as used", () => {
    const p = prepare(module, [scenario({ steps: "4\tthe course is open\n5\tnothing defines this" }, "Search matches every word"), steps("9\tvitest\tthe course is open", { titles: "Search matches every word" })]);
    expect(stepGaps(p)).toEqual([]);
  });
});
