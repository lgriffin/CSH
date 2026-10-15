// Told rules lifted from prose (Analyse, danger and grain, stage 55): which sentences are layering or EARS rules, and
// where each is read from.
import { describe, expect, it } from "vitest";
import { cruiserChecks, repoTokens, run } from "../src/markdown.ts";
import { sentencesOf, toldKind, toldSentences } from "../src/told.ts";

const doc = (path: string, text: string, config: Record<string, string> = { told: "sentences" }) =>
  run({ source: { name: "Docs", kind: "Documents" }, files: [{ path, bytes: new TextEncoder().encode(text) }], config } as Parameters<typeof run>[0]);

describe("toldKind", () => {
  it.each([
    ["The domain does not import the store.", "layering"],
    ["Handlers must never depend on the database driver.", "layering"],
    ["The core depends only on the standard library.", "layering"],
    ["The store is independent of the HTTP layer.", "layering"],
    ["Your business rules simply don't know anything at all about the outside world.", "layering"],
    ["Business rules are not bound to the database.", "layering"],
    ["The UI is decoupled from persistence.", "layering"],
    ["Outer layers depend on inner layers, never the reverse.", "layering"],
    ["Ports import nothing.", "layering"],
    ["Nothing in the pipeline imports a concrete middleware.", "layering"],
    ["The lint forbids any import of the global logger.", "layering"],
    ["When a reservation exceeds the stock, the service shall reject it.", "ears"],
    ["The service shall log every refusal.", "ears"],
  ])("%s is %s", (s, kind) => expect(toldKind(s)).toBe(kind));
  it.each(["Deployment depends on Docker.", "Imports are sorted with goimports.", "The service keeps no state between requests.", "Nothing is cached.", "Run the tests with make.",
    // Stage 60: a restriction far from the dependency, a hyphenated "only", a hedge and a question restrict nothing.
    "Components in any outer layer can depend on components in any inner layer, not necessarily the one closest to them.",
    "At first glance, based on imports, it might seem that the Dependency Rule isn't violated.",
    "Imports therefore carry the `.ts` extension, type-only imports say `import type`, and `enum` and constructor parameter properties are not available.",
    "Does the domain not import the store?",
  ])("%s is no told rule", (s) => expect(toldKind(s)).toBeUndefined());
});

describe("sentencesOf", () => {
  it("ends a sentence at a full stop before white space, outside backticks and abbreviations", () => {
    expect(sentencesOf("Use `a.b. c` here. Then e.g. that! Last").map((s) => s.text)).toEqual(["Use `a.b. c` here.", "Then e.g. that!", "Last"]);
  });
});

describe("toldSentences", () => {
  const lines = [
    "# Title",
    "",
    "The domain does not",
    "import the store. It is small.",
    "",
    "- The API must not import the store.",
    "- Plain item.",
    "",
    "```",
    "The domain does not import anything here.",
    "```",
    "| The table does not import anything | x |",
    "## REQ-1 · A requirement",
    "",
    "The domain does not import the cache.",
    "",
    "## Next",
    "",
    "> The cache never depends on the API.",
  ];
  it("reads paragraphs, list items and quotes; never fences, tables or an identified item's section", () => {
    const got = toldSentences(lines, (h) => /^REQ-\d+/.test(h));
    expect(got).toEqual([
      { line: 3, text: "The domain does not import the store.", told: "layering" },
      { line: 6, text: "The API must not import the store.", told: "layering" },
      { line: 19, text: "The cache never depends on the API.", told: "layering" },
    ]);
  });
});

describe("the Markdown adapter with told: sentences", () => {
  it("lifts each told sentence as an item at its line, and reads nothing new without the setting", () => {
    const text = "# Doc\n\nThe domain does not import the store. The API is independent of the store.\n\nWhen it rains, the roof shall hold.\n";
    const out = doc("docs/a.md", text);
    const told = out.items!.filter((i) => i.attrs?.lifted !== undefined);
    expect(told.map((i) => [i.id, i.kind, i.span, i.attrs!.lifted, i.pattern])).toEqual([
      ["docs/a.md#L3", "requirement", "docs/a.md:3", "layering", undefined],
      ["docs/a.md#L3~2", "requirement", "docs/a.md:3", "layering", undefined],
      ["docs/a.md#L5", "requirement", "docs/a.md:5", "ears", "event-driven"],
    ]);
    expect(told[0]!.attrs!.sentence).toBe("The domain does not import the store.");
    expect(doc("docs/a.md", text, {}).items!.filter((i) => i.attrs?.lifted !== undefined)).toEqual([]);
  });

  it("marks a sentence that claims something checks it with the phrase that claims it (stage 56)", () => {
    const text = "# Doc\n\nThe domain is guaranteed not to import the store. The API cannot import the store.\n\n- The store never imports the API, and this is enforced in CI.\n";
    const told = doc("docs/a.md", text).items!.filter((i) => i.attrs?.lifted !== undefined);
    expect(told.map((i) => [i.id, i.attrs!.claims])).toEqual([
      ["docs/a.md#L3", "guaranteed"],
      ["docs/a.md#L3~2", undefined],
      ["docs/a.md#L5", "enforced"],
    ]);
  });
});

describe("what the tutors run taught the Markdown adapter (From the tutors run, sections 5 to 7)", () => {
  const read = (files: Record<string, string>) =>
    run({ source: { name: "Docs", kind: "Documents" }, files: Object.entries(files).map(([path, text]) => ({ path, bytes: new TextEncoder().encode(text) })), config: { told: "sentences" } } as unknown as Parameters<typeof run>[0]);

  it("reads no scenario of a gherkin fence in a document that does not say they are not executed", () => {
    expect(read({ "m.md": "# How to write one\n\n```gherkin\n  Scenario: An example\n```\n" }).items!.filter((i) => i.attrs?.gherkin === "prose")).toEqual([]);
  });

  it("reads a sentence that runs over a line break whole", () => {
    const out = read({ "o.md": "The word lists are the defaults. An optional\n`tests/x.json` may override them; none\nis committed.\n" });
    expect(out.edges!.filter((e) => e.rel === "mentions-file").map((e) => [e.to, e.absent ?? false])).toEqual([["file:tests/x.json", true]]);
  });

  it("marks a mention in a sentence that says the file is absent, or names another repository", () => {
    const out = read({ "a.md": "These came from `docs/old.feature`, which was retired whole. The harness's own `scripts/x.sh` in tutors-sdk/tutors-release-harness reads it. The build runs `scripts/b.sh`.\n" });
    const edges = out.edges!.filter((e) => e.rel === "mentions-file").map((e) => [e.to, e.absent ?? false, e.repos ?? []]);
    expect(edges).toEqual([
      ["file:docs/old.feature", true, []],
      ["file:scripts/x.sh", false, ["tutors-sdk/tutors-release-harness"]],
      ["file:scripts/b.sh", false, []],
    ]);
  });

  it("reads a path as used when its words name it, or another sentence on its line uses it", () => {
    const out = read({ "u.md": "`src/config.ts` is used to configure the app. `api/delete.ts` handles requests.\n\n`a/b.ts` builds it. Its `a/b.ts` step was removed.\n" });
    expect(out.edges!.filter((e) => e.rel === "mentions-file").map((e) => [e.to, e.absent ?? false])).toEqual([["file:src/config.ts", false], ["file:api/delete.ts", false], ["file:a/b.ts", false]]);
  });

  it("reads each list item as a paragraph of its own", () => {
    const out = read({ "l.md": "- `old/a.ts` was removed\n- `new/b.ts` builds and/or tests it\n" });
    expect(out.edges!.filter((e) => e.rel === "mentions-file").map((e) => [e.to, e.absent ?? false, e.repos ?? []])).toEqual([["file:old/a.ts", true, []], ["file:new/b.ts", false, []]]);
  });

  it("reads a text file that does not say it may only shrink as nothing", () => {
    expect(read({ "requirements.txt": "# pinned\nvitest==1\n", "LICENSE.txt": "MIT\n" }).items).toEqual([]);
  });

  it("reads no gherkin fence as specification prose when the not-executed sentence is about something else", () => {
    expect(read({ "h.md": "# Hooks\n\nThe hook is not executed on CI.\n\n```gherkin\n  Scenario: An example\n```\n" }).items!.filter((i) => i.attrs?.gherkin === "prose")).toEqual([]);
  });

  it("reads a baseline's entries, and nothing of a text file's comments", () => {
    const out = read({ "known.txt": "# This file may only shrink.\n\nrule: a -> b\nrule: c -> d\n" });
    expect(out.items!.map((i) => [i.id, i.kind, i.attrs])).toEqual([["known.txt", "baseline", { entries: "2", first: "rule: a -> b\nrule: c -> d" }]]);
  });

  it("verifies a told rule by the dependency-cruiser check it names", () => {
    const out = read({ ".dependency-cruiser.cjs": 'module.exports = { forbidden: [{ name: "types-self-contained", from: {}, to: {} }] };\n', "d.md": "The types package imports nothing outside itself (the `types-self-contained` rule).\n" });
    expect(out.edges!.filter((e) => e.rel === "verified-by")).toEqual([{ from: "d.md#L1", rel: "verified-by", to: "file:.dependency-cruiser.cjs", span: "d.md:1" }]);
  });

  it("reads each scenario of a gherkin fence as a requirement, and nothing of another fence", () => {
    const out = read({ "s.md": "# S\n\nThese scenarios are specification prose, not executed.\n\n```gherkin\n  Scenario: Shows the line\n    Given a note\n  Scenario Outline: Shows <n> lines\n```\n\n```ts\nconst s = \"Scenario: Not one\";\n```\n" });
    expect(out.items!.filter((i) => i.attrs?.gherkin === "prose").map((i) => [i.id, i.kind, i.text, i.span])).toEqual([
      ["s.md#shows-the-line", "requirement", "Shows the line", "s.md:6"],
      ["s.md#shows-n-lines", "requirement", "Shows <n> lines", "s.md:8"],
    ]);
  });
});

describe("repoTokens and cruiserChecks", () => {
  it("finds owner/repo tokens, never a media type or a longer path", () => {
    expect(repoTokens("in tutors-sdk/tutors-release-harness, see `docs/a/b.md` and application/json or `src/core-2`")).toEqual(["tutors-sdk/tutors-release-harness", "src/core-2"]);
  });
  it("does not read words joined by a slash as a repository", () => {
    expect(repoTokens("read/write and/or client/server, UI/UX, async/await")).toEqual([]);
  });
  it("reads each check name, quoted any way", () => {
    expect(cruiserChecks(`{ name: "a" }, { "name": 'b' }, { name: \`c\` }, { label: "d" }`)).toEqual(["a", "b", "c"]);
  });
});
