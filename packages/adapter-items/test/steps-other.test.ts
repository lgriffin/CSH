// Step definitions in Python, Java, Go and Rust (stage 59): behave, Cucumber-JVM, godog and cucumber-rs, read from the
// code with nothing run.
import { describe, expect, it } from "vitest";
import { digestOf } from "@csh/kernel";
import type { AdapterInput } from "@csh/witness";
import { stepDefinitionsOther } from "../src/steps-other.ts";
import { run as tests } from "../src/tests.ts";

const shown = (text: string, lang: Parameters<typeof stepDefinitionsOther>[1]) => stepDefinitionsOther(text, lang).map((d) => [d.line, d.pattern.k, d.pattern.k === "regex" ? d.pattern.source : d.pattern.text]);

describe("step definitions in other languages", () => {
  it("reads behave's parse format, its regular expressions after use_step_matcher, and raw strings", () => {
    const py = ['from behave import given, when, use_step_matcher', '', '@given("a board with {n:d} cards")', "def a(context, n): pass", "", 'use_step_matcher("re")', "", "@when(r'^a card moves to (\\w+)$')", "def b(context, c): pass", "", "@then(name)", "def c(context): pass", ""].join("\n");
    expect(shown(py, "python")).toEqual([
      [3, "expression", "a board with {n:d} cards"],
      [8, "regex", "^a card moves to (\\w+)$"],
      [11, "unreadable", "@then(name)"],
    ]);
  });

  it("reads Cucumber-JVM's expressions and anchored regular expressions, escapes resolved", () => {
    const java = ['class S {', '  @Given("a board with {int} cards") void a(int n) {}', '  @When(value = "^a card moves to (\\\\w+)$") void b(String c) {}', '  @Then("^(unclosed$") void c() {}', '}', ""].join("\n");
    expect(shown(java, "java")).toEqual([
      [2, "expression", "a board with {int} cards"],
      [3, "regex", "^a card moves to (\\w+)$"],
      [4, "unreadable", "/^(unclosed$/"],
    ]);
  });

  it("reads godog's patterns, raw and interpreted, always as regular expressions", () => {
    const go = ["package f", "", "func Init(ctx *godog.ScenarioContext) {", "\tctx.Step(`^a board with (\\d+) cards$`, a)", '\tctx.Then("^the board holds (\\\\d+) cards$", b)', "}", ""].join("\n");
    expect(shown(go, "go")).toEqual([
      [4, "regex", "^a board with (\\d+) cards$"],
      [5, "regex", "^the board holds (\\d+) cards$"],
    ]);
  });

  it("reads cucumber-rs's expr, regex and exact strings", () => {
    const rs = ['#[given(expr = "a board with {int} cards")]', "fn a(w: &mut W, n: usize) {}", '#[when(regex = r"^a card moves to (\\w+)$")]', "fn b(w: &mut W, c: String) {}", '#[then("the board holds 3 cards (all)")]', "fn c(w: &mut W) {}", ""].join("\n");
    expect(shown(rs, "rust")).toEqual([
      [1, "expression", "a board with {int} cards"],
      [3, "regex", "^a card moves to (\\w+)$"],
      [5, "regex", "^the board holds 3 cards \\(all\\)$"],
    ]);
  });

  it("are read only in style cucumber, and a file of steps alone is not an empty test file", () => {
    const text = 'from behave import given\n\n@given("a board")\ndef a(context): pass\n';
    const input = (config?: Record<string, string>): AdapterInput => ({ source: { name: "Steps", kind: "TestFiles", at: "." }, vocabulary: { units: [], enums: [], states: [], events: [] }, bindings: [], files: [{ path: "features/steps/s.py", digest: digestOf(new TextEncoder().encode(text)), bytes: new TextEncoder().encode(text) }], ...(config !== undefined ? { config } : {}) });
    const cucumber = tests(input({ style: "cucumber" }));
    expect(cucumber.items![0]!.attrs).toEqual({ tests: "0", steps: "1", stepDefinitions: "3\texpression\ta board" });
    expect(cucumber.diagnostics).toEqual([]);
    const plain = tests(input());
    expect(plain.items![0]!.attrs).toEqual({ tests: "0" });
    expect(plain.diagnostics.map((d) => d.code)).toEqual(["no-tests"]);
  });
});
