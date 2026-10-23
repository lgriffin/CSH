// import-linter contracts (From the Toads run, section 4; stage 62): read from configuration as text, and the three ways
// a told rule names one.
import { describe, expect, it } from "vitest";
import { importContracts, namesContract } from "../src/import-linter.ts";
import { run } from "../src/markdown.ts";

const TOML = [
  "[project]",
  'name = "shop"',
  "",
  "[tool.importlinter]",
  'root_packages = ["shop_api", "shop_bot"]',
  "",
  "[[tool.importlinter.contracts]]",
  'name = "The bot talks to the API only over HTTP: no shop_api imports"',
  'type = "forbidden"',
  'source_modules = ["shop_bot"]  # the bot',
  "forbidden_modules = [",
  '  "shop_api",',
  "  'sqlalchemy',",
  "]",
  "",
  "[[tool.importlinter.contracts]]",
  'name = "Only the worker imports the analyzer (ana_core)"',
  'type = "forbidden"',
  'source_modules = ["shop_api", "shop_bot"]',
  'forbidden_modules = ["ana_core"]',
  "",
  "[tool.ruff]",
  'line-length = 120',
  "",
].join("\n");

describe("import-linter contracts", () => {
  it("reads each contract of a pyproject.toml, arrays over several lines and comments aside", () => {
    expect(importContracts("pyproject.toml", TOML)).toEqual([
      { name: "The bot talks to the API only over HTTP: no shop_api imports", type: "forbidden", sources: ["shop_bot"], forbidden: ["shop_api", "sqlalchemy"] },
      { name: "Only the worker imports the analyzer (ana_core)", type: "forbidden", sources: ["shop_api", "shop_bot"], forbidden: ["ana_core"] },
    ]);
  });
  it("reads an INI configuration, lists one per line or comma-separated", () => {
    const ini = ["[importlinter]", "root_package = shop", "", "[importlinter:contract:bot]", "name = Bot over HTTP", "type = forbidden", "source_modules =", "    shop.bot", "forbidden_modules = shop.api, sqlalchemy", "", "[other]", "x = 1", ""].join("\n");
    expect(importContracts(".importlinter", ini)).toEqual([{ name: "Bot over HTTP", type: "forbidden", sources: ["shop.bot"], forbidden: ["shop.api", "sqlalchemy"] }]);
  });
  it("reads nothing from a pyproject.toml with no import-linter table", () => {
    expect(importContracts("pyproject.toml", '[project]\nname = "x"\n')).toEqual([]);
  });
});

describe("a told rule that names a contract", () => {
  const cs = importContracts("pyproject.toml", TOML);
  const names = (s: string) => namesContract(s, [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]!), "pyproject.toml", cs);
  it.each([
    "Only the worker imports the analyzer packages (`ana-core`).",
    "The bot may not import `shop_api`, so it reaches the API over HTTP.",
    "A cog never touches the database (an import contract in `pyproject.toml` forbids it).",
    "`lint-imports` fails when a cog imports the store; see `pyproject.toml`.",
  ])("%s is verified", (s) => expect(names(s)).toBe(true));
  it.each([
    "The API does not import `sqlalchemy` outside its repositories.",
    "Only the worker imports things.",
    "An import contract forbids it.",
  ])("%s is not", (s) => expect(names(s)).toBe(false));

  it("is a verified-by edge to the configuration from the told rule", () => {
    const enc = (t: string) => new TextEncoder().encode(t);
    const out = run({ source: { name: "Docs", kind: "Documents" }, files: [{ path: "pyproject.toml", bytes: enc(TOML) }, { path: "docs/a.md", bytes: enc("# A\n\nThe bot may not import `shop_api`.\n") }], config: { told: "sentences" } } as unknown as Parameters<typeof run>[0]);
    expect((out.edges ?? []).filter((e) => e.rel === "verified-by")).toEqual([{ from: "docs/a.md#L3", rel: "verified-by", to: "file:pyproject.toml", span: "docs/a.md:3" }]);
  });
});
