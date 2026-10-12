// The inventory adapters (Ingesting a codebase, stage 22): structure read into items and edges, with no meaning
// guessed and nothing left unsaid.
import { describe, expect, it } from "vitest";
import { digestOf } from "@csh/kernel";
import type { AdapterInput } from "@csh/witness";
import { run as gherkin } from "../src/gherkin.ts";
import { run as jsonl } from "../src/jsonl.ts";
import { firstSentence, run as markdown } from "../src/markdown.ts";
import { run as tests } from "../src/tests.ts";
import { parseYaml, run as yaml } from "../src/yaml.ts";
import { reduceTestResults } from "@csh/witness";
import { pathToken, slug } from "../src/common.ts";

const input = (files: Record<string, string>, config?: Record<string, string>, kind = "Documents"): AdapterInput => ({
  source: { name: "S", kind, at: "." },
  vocabulary: { units: [], enums: [], states: [], events: [] },
  bindings: [],
  files: Object.entries(files).map(([path, text]) => {
    const bytes = new TextEncoder().encode(text);
    return { path, digest: digestOf(bytes), bytes };
  }),
  ...(config !== undefined ? { config } : {}),
});

const CHARTER = [
  "# Charter",
  "",
  "#### ARCH-01 · Ubiquitous · Enforced",
  "",
  "The library **shall** derive types from `src/types/generated/`.",
  "",
  "- **Why:** Generated code stays honest.",
  "- **Verified by:** `npm run generate:types` then `git diff` on `src/types/generated/`. Also see `src/gone.ts`.",
  "",
  "#### ARCH-03 · Ubiquitous · Practised",
  "",
  "Modules **shall** receive the cache as a parameter.",
  "",
  "- **Verified by:** Code review. `lint:layers` does not check this.",
  "",
  "```",
  "#### ARCH-99 inside a fence is not a heading",
  "```",
].join("\n");

describe("the Markdown adapter", () => {
  it("reads a heading that opens with an identifier as a requirement, its fields and its verification", () => {
    const out = markdown(input({ "guides/CHARTER.md": CHARTER }, { headingFields: "form,status" }));
    expect(out.diagnostics).toEqual([]);
    expect(out.items!.map((i) => [i.id, i.kind])).toEqual([["guides/CHARTER.md", "document"], ["ARCH-01", "requirement"], ["ARCH-03", "requirement"]]);
    const arch01 = out.items![1]!;
    expect(arch01.text).toBe("The library shall derive types from `src/types/generated/`.");
    expect(arch01.span).toBe("guides/CHARTER.md:3");
    expect(arch01.attrs).toMatchObject({ form: "Ubiquitous", status: "Enforced", why: "Generated code stays honest." });
    // Only the first sentence of Verified by names mechanisms; a path elsewhere is a mention.
    expect(out.edges!.filter((e) => e.from === "ARCH-01")).toEqual([
      { from: "ARCH-01", rel: "mentions-file", to: "file:src/types/generated/", span: "guides/CHARTER.md:5" },
      { from: "ARCH-01", rel: "mentions-script", to: "script:generate:types", span: "guides/CHARTER.md:8" },
      { from: "ARCH-01", rel: "verified-by", to: "text:npm run generate:types", span: "guides/CHARTER.md:8" },
      { from: "ARCH-01", rel: "verified-by", to: "text:git diff", span: "guides/CHARTER.md:8" },
      { from: "ARCH-01", rel: "verified-by", to: "file:src/types/generated/", span: "guides/CHARTER.md:8" },
      { from: "ARCH-01", rel: "mentions-file", to: "file:src/gone.ts", span: "guides/CHARTER.md:8" },
    ]);
    expect(out.edges!.filter((e) => e.from === "ARCH-03")).toEqual([]);
  });

  it("reads an Implements line, and identifier headings as references when asked", () => {
    const doc = "# Errors\n\n**Implements:** `ARCH-07`, DOC-01 (one reference)\n\n### GATE-01 · the fan-in\n\nText.\n";
    const out = markdown(input({ "guides/ERRORS.md": doc }, { headings: "references" }));
    expect(out.items!.map((i) => i.id)).toEqual(["guides/ERRORS.md"]);
    expect(out.edges!.map((e) => [e.rel, e.to])).toEqual([["implements", "ARCH-07"], ["implements", "DOC-01"], ["implements", "GATE-01"]]);
  });

  it("reports an identifier defined twice", () => {
    const out = markdown(input({ "a.md": "## R-1 one\n\n## R-1 two\n" }));
    expect(out.diagnostics.map((d) => [d.code, d.span])).toEqual([["duplicate-id", "a.md:3"]]);
  });

  it("reads a Verified by that runs on to indented lines, and paths written in headings", () => {
    const doc = ["# Uses `src/a.ts`", "", "## R-1 · see `src/b.ts`", "", "Text.", "", "- **Verified by:** the", "  `npm test` run and `src/c.ts`. Not `src/d.ts`.", ""].join("\n");
    const out = markdown(input({ "a.md": doc }));
    expect(out.edges!.map((e) => [e.from, e.rel, e.to, e.span])).toEqual([
      ["a.md", "mentions-file", "file:src/a.ts", "a.md:1"],
      ["R-1", "mentions-file", "file:src/b.ts", "a.md:3"],
      ["R-1", "verified-by", "text:npm test", "a.md:8"],
      ["R-1", "verified-by", "file:src/c.ts", "a.md:8"],
      ["R-1", "mentions-file", "file:src/d.ts", "a.md:8"],
    ]);
  });

  it("closes a fence only with one of the same character at least as long", () => {
    const doc = ["````md", "```", "## R-9 an example", "```", "````", "## R-2 real"].join("\n");
    expect(markdown(input({ "a.md": doc })).items!.map((i) => i.id)).toEqual(["a.md", "R-2"]);
  });

  it("takes an identifier pattern with alternatives or groups of its own", () => {
    const doc = "**Implements:** XARCH-1, SEC-2\n\n## ARCH-3 · Ubiquitous\n\nText.\n";
    const out = markdown(input({ "a.md": doc }, { idPattern: "(ARCH|SEC)-[0-9]+", headingFields: "form" }));
    expect(out.edges!.map((e) => e.to)).toEqual(["SEC-2"]);
    expect(out.items![1]).toMatchObject({ id: "ARCH-3", attrs: { form: "Ubiquitous" } });
    const alt = markdown(input({ "a.md": doc }, { idPattern: "ARCH-[0-9]+|SEC-[0-9]+" }));
    expect(alt.edges!.map((e) => e.to)).toEqual(["SEC-2"]);
  });

  it("ends a first sentence at a full stop outside backticks", () => {
    expect(firstSentence("`a.b` then `c`. More.")).toBe("`a.b` then `c`.");
    expect(firstSentence("No stop")).toBe("No stop");
  });

  it("treats only root-relative slash paths as repository paths", () => {
    expect(pathToken("src/core/error.ts")).toBe("src/core/error.ts");
    expect(pathToken("tests/typetests/")).toBe("tests/typetests/");
    for (const t of ["./errors", "../x/y", "@lgriffin/esi.ts", "src/*.ts", "npm run x", "https://x/y", "package.json"]) expect(pathToken(t), t).toBeUndefined();
  });
});

const FEATURE = [
  "@core",
  "Feature: Universe reference tables",
  "  Free text under the feature.",
  "",
  "  Background:",
  "    Given a provider",
  "",
  "  Rule: When a landmark ID is looked up, the SDE provider shall return the landmark.",
  "    @sec-P5",
  "    Scenario: Landmark 1 resolves",
  "      Given a provider",
  '      """',
  "      Scenario: inside a doc string",
  '      """',
  "    Scenario Outline: Many landmarks",
  "      Examples:",
  "        | id |",
  "  Rule: Landmarks are drawn on maps",
  "",
  "  Scenario: Under no rule",
].join("\n");

describe("the Gherkin inventory adapter", () => {
  it("reads features, rules and scenarios, with the rule each scenario exemplifies", () => {
    const out = gherkin(input({ "f/a.feature": FEATURE }, { tagCites: "sec-(P[0-9]+)" }, "Features"));
    expect(out.items!.map((i) => [i.kind, i.id])).toEqual([
      ["feature", "f/a.feature"],
      ["rule", "f/a.feature#when-a-landmark-id-is-looked-up-the-sde-provider-shall-return-the-landmark"],
      ["scenario", "f/a.feature#when-a-landmark-id-is-looked-up-the-sde-provider-shall-return-the-landmark/landmark-1-resolves"],
      ["scenario", "f/a.feature#when-a-landmark-id-is-looked-up-the-sde-provider-shall-return-the-landmark/many-landmarks"],
      ["rule", "f/a.feature#landmarks-are-drawn-on-maps"],
      ["scenario", "f/a.feature#landmarks-are-drawn-on-maps/under-no-rule"],
    ]);
    expect((out.items ?? [])[0]!.attrs).toEqual({ tags: "@core" });
    expect(out.items![1]!.pattern).toBe("event-driven");
    expect(out.items![3]!.attrs).toEqual({ outline: "true" });
    expect(out.edges!.filter((e) => e.rel === "exemplifies").map((e) => e.to)).toEqual([out.items![1]!.id, out.items![1]!.id, out.items![4]!.id]);
    expect(out.edges!.filter((e) => e.rel === "cites")).toEqual([{ from: out.items![2]!.id, rel: "cites", to: "P5", span: "f/a.feature:10" }]);
    expect(out.diagnostics.map((d) => [d.code, d.span])).toEqual([["no-pattern", "f/a.feature:18"]]);
  });

  it("says when a feature file holds nothing it can read", () => {
    expect(gherkin(input({ "e.feature": "# only a comment\n" }, undefined, "Features")).diagnostics.map((d) => d.code)).toEqual(["no-items"]);
  });

  it("makes repeated titles unique", () => {
    expect(slug("A  title!")).toBe("a-title");
    const out = gherkin(input({ "d.feature": "Feature: d\n  Scenario: same\n  Scenario: same\n" }, undefined, "Features"));
    expect(out.items!.map((i) => i.id)).toEqual(["d.feature", "d.feature#/same", "d.feature#/same~2"]);
  });
});

describe("the test-file adapter", () => {
  it("counts tests and cites identifiers in titles only", () => {
    const file = ["describe('SEC-11: every call is indexed', () => {", "  it('lists ARCH-01', () => expect(['P2', 'SEC-12']).toBeTruthy());", "  it.skip(`later`, () => {});", "  // SEC-13 in a comment", "});"].join("\n");
    const out = tests(input({ "tests/a.test.ts": file, "tests/b.test.ts": "export {};\n" }, undefined, "TestFiles"));
    expect(out.items!.map((i) => [i.id, i.attrs])).toEqual([["tests/a.test.ts", { tests: "2", skipped: "1" }], ["tests/b.test.ts", { tests: "0" }]]);
    expect(out.edges!.map((e) => [e.to, e.span])).toEqual([["SEC-11", "tests/a.test.ts:1"], ["ARCH-01", "tests/a.test.ts:2"]]);
    expect(out.diagnostics.map((d) => [d.code, d.span])).toEqual([["no-tests", "tests/b.test.ts"]]);
  });

  it("reads parameterised tests, and never a call inside a string or a comment", () => {
    const file = [
      "it.each([",
      "  [1, 'a)'],",
      "])('ARCH-02 row %s', (n) => {});",
      "test.each<Row>(rows)(`ARCH-03 typed`, () => {});",
      "describe.each`",
      "  a | b",
      "`('ARCH-04 table', () => {});",
      "const src = \"it('ARCH-05 in a fixture', () => {})\";",
      "// it('ARCH-06 commented out', () => {});",
      "/* test('ARCH-07 in a block comment') */",
      "const re = /it\\('ARCH-08'/;",
      "foo.it('ARCH-09 not a test');",
    ].join("\n");
    const out = tests(input({ "tests/p.test.ts": file }, undefined, "TestFiles"));
    expect((out.items ?? [])[0]!.attrs).toEqual({ tests: "2" });
    expect(out.edges!.map((e) => [e.to, e.span])).toEqual([["ARCH-02", "tests/p.test.ts:3"], ["ARCH-03", "tests/p.test.ts:4"], ["ARCH-04", "tests/p.test.ts:7"]]);
  });
});

describe("test results (stage 26)", () => {
  const FILE = ["describe('SEC-11: indexing', () => {", "  it('lists ARCH-01', () => {});", "  it('runs', () => {});", "});"].join("\n");
  const withResults = (results: Record<string, string>) => {
    const i = input({ "tests/a.test.ts": FILE, "tests/b.test.ts": "it('x', () => {});\n" }, undefined, "TestFiles");
    i.executions = Object.entries(results).map(([path, text]) => {
      const bytes = new TextEncoder().encode(text);
      return { path, digest: digestOf(bytes), bytes };
    });
    return i;
  };
  const jest = JSON.stringify({
    numTotalTests: 4,
    testResults: [
      {
        name: "/ci/work/tests/a.test.ts",
        status: "failed",
        assertionResults: [
          { ancestorTitles: ["SEC-11: indexing"], title: "lists ARCH-01", fullName: "SEC-11: indexing lists ARCH-01", status: "failed" },
          { ancestorTitles: ["SEC-11: indexing"], title: "runs", fullName: "SEC-11: indexing runs", status: "passed" },
          { ancestorTitles: [], title: "later", fullName: "later", status: "pending" },
        ],
      },
      { name: "/ci/work/vendor/c.test.ts", status: "passed", assertionResults: [{ title: "elsewhere", status: "passed" }] },
      { name: "/ci/work/tests/d.test.ts", status: "failed", assertionResults: [], failureMessage: "Cannot find module" },
    ],
  });

  it("joins a Jest or Vitest JSON report to each file and to what each test's full name cites", () => {
    const out = tests(withResults({ "results/jest.json": jest }));
    expect(out.results).toEqual([
      { file: "tests/a.test.ts", outcome: "failed", cites: ["ARCH-01", "SEC-11"], span: "results/jest.json#testResults[0].assertionResults[0]" },
      { file: "tests/a.test.ts", outcome: "passed", cites: ["SEC-11"], span: "results/jest.json#testResults[0].assertionResults[1]" },
      { file: "tests/a.test.ts", outcome: "skipped", cites: [], span: "results/jest.json#testResults[0].assertionResults[2]" },
    ]);
    expect(out.items!.find((i) => i.id === "tests/a.test.ts")!.attrs).toEqual({ tests: "2", passed: "1", failed: "1", errored: "0", skipped: "1" });
    // Runner file names are never repeated: the files outside the source are counted, and the unrun file is too.
    expect(out.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ["results-unmatched", "2 results in 2 files name no test file of the source"],
      ["results-missing", "1 test files declare tests and have no result: their outcomes are unknown"],
    ]);
  });

  it("joins a nested file to its longest matching path, and replaces a declared skip with the runner's count", () => {
    const i = input({ "test/a.test.ts": "it.skip('x', () => {});\nit('y', () => {});\n", "packages/x/test/a.test.ts": "it('z', () => {});\n" }, undefined, "TestFiles");
    const report = JSON.stringify({ testResults: [{ name: "/r/packages/x/test/a.test.ts", assertionResults: [{ title: "z", status: "passed" }] }, { name: "/r/test/a.test.ts", assertionResults: [{ title: "y", status: "passed" }] }] });
    i.executions = [{ path: "r.json", ...(() => { const bytes = new TextEncoder().encode(report); return { digest: digestOf(bytes), bytes }; })() }];
    const out = tests(i);
    expect(out.results!.map((r) => r.file)).toEqual(["packages/x/test/a.test.ts", "test/a.test.ts"]);
    expect(out.items!.find((x) => x.id === "test/a.test.ts")!.attrs).toEqual({ tests: "2", passed: "1", failed: "0", errored: "0", skipped: "0" });
    expect(out.diagnostics).toEqual([]);
  });

  it("reads csh-execution/v1 lines too, by file and full name", () => {
    const lines = [JSON.stringify({ schema: "csh-execution/v1", test: "tests/b.test.ts::x", outcome: "errored" }), "{oops"].join("\n");
    const out = tests(withResults({ "results/run.ndjson": lines }));
    expect(out.results).toEqual([{ file: "tests/b.test.ts", outcome: "errored", cites: [], span: "results/run.ndjson:1" }]);
    expect(out.diagnostics.map((d) => [d.code, d.span])).toEqual([
      ["malformed-results", "results/run.ndjson:2"],
      ["results-missing", undefined],
    ]);
  });

  it("reads a reduced results file as the report it was reduced from, and joins none from another commit (stage 28)", () => {
    const reduced = reduceTestResults(jest, { cite: /\b(?:[A-Z][A-Z0-9]*-[0-9]+)\b/g, base: "/ci/work", commit: "c1" });
    expect(reduced.problems).toEqual([]);
    const text = JSON.stringify(reduced.reduced);
    // Test names are dropped: only paths, counts, outcomes and cited identifiers remain.
    expect(text).not.toMatch(/lists|indexing|later|elsewhere/);
    expect(reduced.reduced.files.map((f) => f.file)).toEqual(["tests/a.test.ts", "tests/d.test.ts", "vendor/c.test.ts"]);
    const fromReport = tests({ ...withResults({ "results/jest.json": jest }), config: { commit: "c1" } });
    const fromReduced = tests({ ...withResults({ "csh/results.json": text }), config: { commit: "c1" } });
    const bare = (o: typeof fromReport) => ({ results: o.results!.map((r) => [r.file, r.outcome, r.cites]).sort(), attrs: o.items!.map((i) => i.attrs), codes: o.diagnostics.map((d) => d.code) });
    expect(bare(fromReduced)).toEqual(bare(fromReport));
    // The identifiers recorded are joined as given, whatever the practice's pattern is now.
    const narrowed = tests({ ...withResults({ "csh/results.json": text }), config: { commit: "c1", idPattern: "NONE-[0-9]+" } });
    expect(narrowed.results!.flatMap((r) => r.cites).sort()).toEqual(["ARCH-01", "SEC-11", "SEC-11"]);
    const bad = (patch: object) => tests({ ...withResults({ "csh/results.json": JSON.stringify({ ...reduced.reduced, ...patch }) }), config: { commit: "c1" } });
    expect(bad({ commit: 7 }).diagnostics.map((d) => d.message)).toContain("commit is not a commit");
    expect(bad({ commit: 7 }).results).toEqual([]);
    expect(bad({ files: [{ file: "tests/a.test.ts", cited: [{ outcome: "passed", cites: [123] }] }] }).diagnostics.map((d) => d.message)).toContain("files[0].cited[0] needs an outcome and a list of identifiers");
    const other = tests({ ...withResults({ "csh/results.json": text }), config: { commit: "c2" } });
    expect(other.results).toEqual([]);
    expect(other.diagnostics.map((d) => [d.code, d.message])).toContainEqual(["results-other-commit", "the results are of c1, not c2: none is joined"]);
  });

  it("says so when the practice names a results file and none was found, and reads none without one", () => {
    expect(tests(withResults({})).diagnostics.map((d) => d.code)).toEqual(["no-results"]);
    const without = tests(input({ "tests/a.test.ts": FILE }, undefined, "TestFiles"));
    expect(without.results).toBeUndefined();
  });
});

describe("the issue adapter", () => {
  it("reads one issue per line, with its fields and the identifiers its text mentions", () => {
    const lines = [JSON.stringify({ id: "esi-1", title: "Fix ARCH-07", description: "See SEC-02 and ARCH-07", status: "open", priority: 2 }), "", "{bad", JSON.stringify({ id: "esi-1" })].join("\n");
    const out = jsonl(input({ ".beads/issues.jsonl": lines }, undefined, "Issues"));
    expect(out.items!.map((i) => [i.id, i.kind, i.text, i.attrs])).toEqual([["esi-1", "issue", "Fix ARCH-07", { status: "open", priority: "2" }]]);
    expect(out.edges!.map((e) => [e.rel, e.to])).toEqual([["mentions", "ARCH-07"], ["mentions", "SEC-02"]]);
    expect(out.diagnostics.map((d) => [d.code, d.span])).toEqual([["malformed-line", ".beads/issues.jsonl:3"], ["duplicate-id", ".beads/issues.jsonl:4"]]);
  });
});

describe("code mentions in prose (stage 24)", () => {
  it("reads a symbol written beside its code file, and an npm script, as edges to check against the facts", () => {
    const doc = [
      "# Errors",
      "",
      "Errors are built by `buildError` in `src/core/error.ts`; `src/index.ts` exports `LibError`.",
      "A table names `Shape` in `docs/shapes.md`, which is not code.",
      "Run `npm run generate:types` first, then `npm run test:<name>` or `npm run lint -- --fix`.",
    ].join("\n");
    const out = markdown(input({ "guides/ERRORS.md": doc }));
    expect(out.edges!.filter((e) => e.rel === "mentions-symbol" || e.rel === "mentions-script").map((e) => [e.rel, e.to, e.span])).toEqual([
      ["mentions-symbol", "symbol:src/core/error.ts#buildError", "guides/ERRORS.md:3"],
      ["mentions-symbol", "symbol:src/index.ts#LibError", "guides/ERRORS.md:3"],
      ["mentions-script", "script:generate:types", "guides/ERRORS.md:5"],
      ["mentions-script", "script:lint", "guides/ERRORS.md:5"],
    ]);
  });
});

describe("the structured trace adapter (stage 28)", () => {
  const MODEL = [
    "# A security model",
    "version: 1",
    "properties:",
    "  - id: P1",
    "    claim: >",
    "      Tokens are never",
    "      logged.",
    "    severity: high",
    "    tests: [tests/a.test.ts, b.test.ts]",
    "    charter: [SEC-01]",
    "  - id: P2",
    "    claim: \"A quoted claim # not a comment\"",
    "    tests:",
    "      - tests/c.test.ts",
    "    charter: [",
    "      SEC-02,",
    "      SEC-03,",
    "    ]",
    "  - id: P3",
    "    claim: Nothing to test",
    "    rule: none",
    "    rule_reason: |",
    "      Out of scope.",
    "  - id: P4",
    "    rule: none",
    "  - claim: no id",
    "  - id: P1",
    "    claim: twice",
  ].join("\n");

  it("parses the YAML subset: folded and block scalars, flow sequences over lines, quotes and comments", () => {
    const { value, problems } = parseYaml(MODEL);
    expect(problems).toEqual([]);
    const props = (value as { properties: Record<string, unknown>[] }).properties;
    expect(props[0]).toEqual({ id: "P1", claim: "Tokens are never logged.", severity: "high", tests: ["tests/a.test.ts", "b.test.ts"], charter: ["SEC-01"] });
    expect(props[1]).toEqual({ id: "P2", claim: "A quoted claim # not a comment", tests: ["tests/c.test.ts"], charter: ["SEC-02", "SEC-03"] });
    expect(props[2]!.rule_reason).toBe("Out of scope.");
    expect(parseYaml('{"a": [1]}').value).toEqual({ a: [1] });
    expect(parseYaml("a: 1\n  - b").problems.length).toBeGreaterThan(0);
  });

  it("continues a quoted scalar to its closing quote, and reads on past a line it cannot place", () => {
    const text = ["properties:", "  - id: P1", '    claim: "one', '      two"', "  - id: P2", "      stray: line", "    claim: kept", "   misaligned: x", "  - id: P3", "    claim: 'it''s'"].join("\n");
    const { value, problems } = parseYaml(text);
    expect((value as { properties: unknown[] }).properties).toEqual([{ id: "P1", claim: "one two" }, { id: "P2", claim: "kept" }, { id: "P3", claim: "it's" }]);
    expect(problems.map((p) => p.line)).toEqual([6, 8]);
  });

  it("reads each entry as a property with the edges and silence the practice maps, and reports what it cannot read", () => {
    const out = yaml(input({ "model.yaml": MODEL }, { edges: "tests=verified-by charter=implements other=bogus", fields: "severity", silence: "rule=none:rule_reason" }, "Traces"));
    expect(out.items!.map((i) => [i.id, i.kind, i.text, i.span, i.attrs])).toEqual([
      ["P1", "property", "Tokens are never logged.", "model.yaml:4", { severity: "high" }],
      ["P2", "property", "A quoted claim # not a comment", "model.yaml:11", undefined],
      ["P3", "property", "Nothing to test", "model.yaml:19", { silence: "rule", "silence-reason": "stated" }],
      ["P4", "property", "", "model.yaml:24", { silence: "rule", "silence-reason": "none" }],
    ]);
    expect(out.edges!.filter((e) => e.from === "P1").map((e) => [e.rel, e.to])).toEqual([
      ["verified-by", "file:tests/a.test.ts"],
      ["verified-by", "file:b.test.ts"],
      ["implements", "SEC-01"],
    ]);
    expect(out.diagnostics.map((d) => [d.code, d.span])).toEqual([
      ["malformed-entry", "model.yaml:26"],
      ["duplicate-id", "model.yaml:27"],
    ]);
    expect(yaml(input({ "m.yaml": "other: []\n" }, undefined, "Traces")).diagnostics.map((d) => d.code)).toEqual(["no-items"]);
  });
});

describe("what the audit of other repositories showed", () => {
  it("does not read a placeholder, a CIDR block or an API group as a repository path", () => {
    for (const t of ["release/vX.Y.Z", "hotfix/vX.Y.Z", "10.0.0.0/9", "coordination.k8s.io/v1", "scripts/<name>.ts", "src/*/index.ts"]) expect(pathToken(t), t).toBeUndefined();
    expect(pathToken("src/core/util/error.ts")).toBe("src/core/util/error.ts");
    expect(pathToken("packages/v2/api")).toBe("packages/v2/api");
  });

  it("does not read the name of an algorithm or an encoding as an identifier", () => {
    const out = markdown(input({ "g.md": "# Guide\n\nUses `SHA-256` and UTF-8, and cites ARCH-01.\n\n**Implements:** ARCH-01\n" }));
    const cited = (out.edges ?? []).map((e) => e.to);
    expect(cited).toContain("ARCH-01");
    expect(cited.filter((t) => /^(SHA|UTF)-/.test(t))).toEqual([]);
  });

  it("takes a rule's own tag as its id when idTag is set, and does not cite it", () => {
    const feature = ["Feature: F", "", "  @rule-0007 @sec-P1", "  Rule: The system shall log", "    Scenario: s", "      Given x", ""].join("\n");
    const out = gherkin(input({ "a.feature": feature }, { idTag: "rule-([0-9]+)", tagCites: "sec-(P[0-9]+)" }, "Features"));
    const rule = (out.items ?? []).find((i) => i.kind === "rule")!;
    expect(rule.id).toBe("0007");
    expect((out.items ?? []).find((i) => i.kind === "scenario")!.id).toBe("0007/s");
    expect((out.edges ?? []).filter((e) => e.rel === "cites").map((e) => e.to)).toEqual(["P1"]);
  });

  it("says when an issue file holds no lines", () => {
    expect(jsonl(input({ "issues.jsonl": "" }, undefined, "Issues")).diagnostics.map((d) => [d.code, d.span])).toEqual([["no-items", "issues.jsonl"]]);
  });
});

describe("Cucumber step definitions", () => {
  const steps = ["import { Given, Then } from \"@cucumber/cucumber\";", "Given(\"a user at ARCH-01\", function () {});", "Then(/^the (\d+) rows$/, function () {});", "// Given(\"in a comment\")", ""].join("\n");

  it("are read as steps, not tests, when the style is cucumber", () => {
    const out = tests(input({ "s.ts": steps }, { style: "cucumber" }, "TestFiles"));
    expect((out.items ?? [])[0]!.attrs).toMatchObject({ tests: "0", steps: "2" });
    expect(out.diagnostics).toEqual([]);
    expect((out.edges ?? []).map((e) => [e.from, e.to])).toEqual([["s.ts", "ARCH-01"]]);
  });

  it("are not read at all otherwise", () => {
    const out = tests(input({ "s.ts": steps }, undefined, "TestFiles"));
    expect((out.items ?? [])[0]!.attrs).toEqual({ tests: "0" });
    expect(out.diagnostics.map((d) => d.code)).toEqual(["no-tests"]);
  });
});

describe("citeBodies", () => {
  const file = ["describe(\"x\", () => {", "  it(\"loops\", () => { for (const m of [\"console-error\", \"focus-order\"]) check(m); });", "  // \"in-comment\"", "});", ""].join("\n");

  it("makes an identifier in any string of the file cite, and a comment still cites nothing", () => {
    const cfg = { citePattern: "console-error|focus-order|in-comment", citeBodies: "true" };
    expect((tests(input({ "t.test.ts": file }, cfg, "TestFiles")).edges ?? []).map((e) => e.to)).toEqual(["console-error", "focus-order"]);
    expect((tests(input({ "t.test.ts": file }, { citePattern: cfg.citePattern }, "TestFiles")).edges ?? []).map((e) => e.to)).toEqual([]);
  });
});

describe("requirements written as table rows", () => {
  const spec = ["# 011 Ingest core", "", "| ID | Pattern | Requirement |", "|----|---------|-------------|", "| ING-001 | Ubiquitous | The system shall never modify a source file. |", "| ING-002 | Event | When a scan ends, the system shall report duplicates. |", ""].join("\n");

  it("are items of kind requirement whose text is the sentence, not the pattern column", () => {
    const out = markdown(input({ "req.md": spec }));
    const reqs = (out.items ?? []).filter((i) => i.kind === "requirement");
    expect(reqs.map((r) => [r.id, r.pattern, r.span])).toEqual([["ING-001", "ubiquitous", "req.md:5"], ["ING-002", "event-driven", "req.md:6"]]);
    expect(reqs[0]!.text).toBe("The system shall never modify a source file.");
  });

  it("are left alone when the practice reads its identifiers as references", () => {
    const out = markdown(input({ "req.md": spec }, { headings: "references" }));
    expect((out.items ?? []).filter((i) => i.kind === "requirement")).toEqual([]);
  });
});
