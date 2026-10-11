// The inventory adapters (Ingesting a codebase, stage 22): structure read into items and edges, with no meaning
// guessed and nothing left unsaid.
import { describe, expect, it } from "vitest";
import { digestOf } from "@csh/kernel";
import type { AdapterInput } from "@csh/witness";
import { run as gherkin } from "../src/gherkin.ts";
import { run as jsonl } from "../src/jsonl.ts";
import { firstSentence, run as markdown } from "../src/markdown.ts";
import { run as tests } from "../src/tests.ts";
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
    expect(out.items![0]!.attrs).toEqual({ tags: "@core" });
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
