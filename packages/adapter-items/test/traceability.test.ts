// Traceability past the file (From real runs, stage 42): tag options cite, steps files load features, step
// definitions are kept with what they match, scenarios keep their steps, and decisions and file identities are read.
import { describe, expect, it } from "vitest";
import { digestOf } from "@csh/kernel";
import type { AdapterInput } from "@csh/witness";
import { run as gherkin } from "../src/gherkin.ts";
import { run as markdown } from "../src/markdown.ts";
import { declarations, loadedFeatures, run as tests, stepDefinitions } from "../src/tests.ts";

const input = (files: Record<string, string>, config?: Record<string, string>, executions?: Record<string, string>): AdapterInput => {
  const of = (m: Record<string, string>) =>
    Object.entries(m).map(([path, text]) => {
      const bytes = new TextEncoder().encode(text);
      return { path, digest: digestOf(bytes), bytes };
    });
  return {
    source: { name: "S", kind: "TestFiles", at: "." },
    vocabulary: { units: [], enums: [], states: [], events: [] },
    bindings: [],
    files: of(files),
    ...(config !== undefined ? { config } : {}),
    ...(executions !== undefined ? { executions: of(executions) } : {}),
  };
};

describe("tag options", () => {
  it("reads a tag string, a tag array, and test.describe as a describe", () => {
    const text = ['test.describe("cart", { tag: "@req-2" }, () => {', '  test("totals", { tag: ["@smoke", "@REQ-3"], annotation: { type: "x" } }, async () => {});', '  test("plain", async () => {});', "});"].join("\n");
    const d = declarations(text);
    expect(d.map((x) => [x.describe, x.title, x.tags])).toEqual([
      [true, "cart", ["@req-2"]],
      [false, "totals", ["@smoke", "@REQ-3"]],
      [false, "plain", []],
    ]);
    const out = tests(input({ "e2e/a.spec.ts": text }, { idPattern: "REQ-[0-9]+" }));
    expect(out.items![0]!.attrs?.tests).toBe("2");
    expect(out.edges!.map((e) => e.to)).toEqual(["REQ-2", "REQ-3"]);
  });

  it("ignores a tag in the test's body, and an options object with no tag", () => {
    const text = 'test("a", { timeout: 5 }, () => { const o = { tag: "@REQ-9" }; });';
    expect(declarations(text)[0]!.tags).toEqual([]);
  });
});

describe("steps files", () => {
  it("reads loadFeature from the root, or from the file's directory when it climbs out", () => {
    const text = 'const a = loadFeature("./features/a.feature");\nconst b = loadFeature("../features/b.feature");';
    expect(loadedFeatures("test/steps/x.steps.ts", text)).toEqual([
      { line: 1, feature: "features/a.feature" },
      { line: 2, feature: "test/features/b.feature" },
    ]);
  });

  it("keeps each definition's pattern: an expression, a regular expression, or one it cannot read", () => {
    const text = ['Given("a cart with {int} items", () => {});', "When(/^the (\\w+) pays$/i, () => {});", "Then(`the ${thing} shows`, () => {});", "Then(/(unclosed/, () => {});"].join("\n");
    expect(stepDefinitions(text).map((d) => d.pattern)).toEqual([
      { k: "expression", text: "a cart with {int} items" },
      { k: "regex", source: "^the (\\w+) pays$", flags: "i" },
      { k: "unreadable", text: "the ${thing} shows" },
      { k: "unreadable", text: "/(unclosed/" },
    ]);
  });

  it("reads a vitest-cucumber file's strings in its dialect, and a const step text (From the tutors run, section 4)", () => {
    const text = ['import { describeFeature } from "@amiceli/vitest-cucumber";', 'const seed = "the calendar holds {number} blocks";', "const twice = `a ${x}`;", 'Given("the file at release/slo.yaml", () => {});', "Given(seed, () => {});", "Given(twice, () => {});", "Given(unknown, () => {});"].join("\n");
    expect(stepDefinitions(text).map((d) => d.pattern)).toEqual([
      { k: "vitest", text: "the file at release/slo.yaml" },
      { k: "vitest", text: "the calendar holds {number} blocks" },
      { k: "unreadable", text: "twice" },
      { k: "unreadable", text: "unknown" },
    ]);
  });

  it("chooses the vitest-cucumber dialect by an import, not by a comment that names the library", () => {
    expect(stepDefinitions('// unlike @amiceli/vitest-cucumber, from "@amiceli/vitest-cucumber" is not imported here\nGiven("a/b", () => {});').map((d) => d.pattern.k)).toEqual(["expression"]);
  });

  it("reads no definition from a step-named call with a bare name alone, such as jest-when's when(mockFn)", () => {
    expect(stepDefinitions('loadFeature("f.feature");\nwhen(mockFn).calledWith(1).mockReturnValue(2);\ngiven("a", () => {});').map((d) => d.title)).toEqual(["a"]);
  });

  it("reads lower-case step functions only in a file that loads a feature", () => {
    expect(stepDefinitions('given("a", () => {});')).toEqual([]);
    expect(stepDefinitions('loadFeature("f.feature");\ngiven("a", () => {});').map((d) => d.title)).toEqual(["a"]);
  });
});

describe("scenario steps, decisions and file identities", () => {
  const feature = [
    "Feature: Cart",
    "  Decisions: ADR-3 and docs/adr/0003-x.md",
    "  Background:",
    "    Given a cart",
    "  @R-1",
    "  Rule: When the shopper adds an item, the system shall count it.",
    "    Specified by: ADR-4",
    "    Background:",
    "      Given a shopper",
    "    Scenario Outline: Adding",
    "      When the shopper adds <n> items",
    "        | a table | row |",
    "      Then the count is <n>",
    "      Examples:",
    "        | n |",
    "        | 1 |",
    "        | 2 |",
  ].join("\n");

  it("keeps a scenario's steps, backgrounds first and an outline once per row", () => {
    const out = gherkin(input({ "features/0003-cart.feature": feature }, { idTag: "(R-[0-9]+)", idPattern: "ADR-[0-9]+", decisionsField: "Decisions|Specified by" }));
    const sc = out.items!.find((i) => i.kind === "scenario")!;
    expect(sc.attrs?.steps?.split("\n")).toEqual(["4\ta cart", "9\ta shopper", "11\tthe shopper adds 1 items", "13\tthe count is 1", "11\tthe shopper adds 2 items", "13\tthe count is 2"]);
    expect(out.edges!.filter((e) => e.rel === "decided-by").map((e) => [e.from, e.to])).toEqual([
      ["features/0003-cart.feature", "ADR-3"],
      ["features/0003-cart.feature", "file:docs/adr/0003-x.md"],
      ["R-1", "ADR-4"],
    ]);
  });

  it("reads no decisions without decisionsField, and warns when two files share an identity", () => {
    const out = gherkin(input({ "f/0003-cart.feature": feature, "f/0003-other.feature": "Feature: Other\n", "f/plain.feature": "Feature: Plain\n" }, { fileId: "(?:^|/)([0-9]{4})-[^/]*\\.feature$" }));
    expect(out.edges!.some((e) => e.rel === "decided-by")).toBe(false);
    expect(out.items!.filter((i) => i.kind === "feature").map((i) => i.attrs?.fileId)).toEqual(["0003", "0003", undefined]);
    expect(out.diagnostics.filter((d) => d.code === "duplicate-file-id").map((d) => d.message)).toEqual(["2 feature files have the identity 0003: f/0003-cart.feature, f/0003-other.feature"]);
  });

  it("joins a cucumber-js report to its features, citing by tags", () => {
    const report = JSON.stringify([
      { uri: "features/0003-cart.feature", name: "Cart", elements: [{ type: "scenario", name: "Adding", tags: [{ name: "@R-1" }], steps: [{ result: { status: "passed" } }] }] },
      { uri: "elsewhere.feature", name: "X", elements: [{ type: "scenario", name: "Y", steps: [] }] },
    ]);
    const out = gherkin(input({ "features/0003-cart.feature": feature }, { idTag: "(R-[0-9]+)" }, { "results/cucumber.json": report }));
    expect(out.results).toEqual([{ file: "features/0003-cart.feature", outcome: "passed", cites: ["R-1"], span: "results/cucumber.json#[0].elements[0]" }]);
    expect(out.diagnostics.map((d) => d.code)).toContain("results-unmatched");
  });
});

describe("placeholders (stage 43)", () => {
  it("reads a token the pattern matches whole as an example, never a path", () => {
    const doc = "# Guide\n\nPut code in `src/x.ts` or `src/real.ts`, and name it `<name>.ts`.\n";
    const to = (config?: Record<string, string>) => markdown({ ...input({ "docs/guide.md": doc }, config), source: { name: "D", kind: "Documents", at: "." } }).edges!.filter((e) => e.rel === "mentions-file").map((e) => e.to);
    expect(to()).toEqual(["file:src/x.ts", "file:src/real.ts"]);
    expect(to({ placeholders: "src/x\\.ts" })).toEqual(["file:src/real.ts"]);
  });
});

describe("list-item requirements (stage 77, A-276)", () => {
  const req = (text: string) => markdown({ ...input({ "REQS.md": text }, { idPattern: "LED-[0-9]+" }), source: { name: "R", kind: "Documents", at: "." } });

  it("defines a requirement by a list item that says shall or must, at any indentation", () => {
    const out = req("# Ledger\n\n- **LED-1** The ledger shall reject a negative amount.\n  - LED-2: Totals mUst balance.\n- LED-3 is covered by the tests.\n");
    expect(out.items!.filter((i) => i.kind === "requirement").map((i) => i.id)).toEqual(["LED-1", "LED-2"]);
  });

  it("reads a later list item that names a defined requirement as a mention, not a second definition", () => {
    const out = req("## LED-1 Reject negatives\n\nThe ledger shall reject a negative amount.\n\n## Traceability\n\n- **LED-1**: tests must cover the overflow case\n");
    expect(out.items!.filter((i) => i.id === "LED-1")).toHaveLength(1);
    expect(out.diagnostics.filter((d) => d.code === "duplicate-id")).toEqual([]);
  });
});
