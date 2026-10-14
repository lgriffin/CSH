// Told rules lifted from prose (Analyse, danger and grain, stage 55): which sentences are layering or EARS rules, and
// where each is read from.
import { describe, expect, it } from "vitest";
import { run } from "../src/markdown.ts";
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
    ["When a reservation exceeds the stock, the service shall reject it.", "ears"],
    ["The service shall log every refusal.", "ears"],
  ])("%s is %s", (s, kind) => expect(toldKind(s)).toBe(kind));
  it.each(["Deployment depends on Docker.", "Imports are sorted with goimports.", "The service keeps no state between requests.", "Nothing is cached.", "Run the tests with make."])("%s is no told rule", (s) => expect(toldKind(s)).toBeUndefined());
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
