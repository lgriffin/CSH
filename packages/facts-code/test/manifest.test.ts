import { describe, expect, it } from "vitest";
import { tomlFields, type FactContext } from "../src/index.ts";

const ctx: FactContext = { commit: "c", base: (tool) => ({ schema: "csh-facts/v2", subject: { commit: "c" }, tool }) };
const file = (path: string, text: string) => ({ path, digest: "", bytes: new TextEncoder().encode(text) });
const tool = { id: "t", version: "0" };

describe("tomlFields", () => {
  it("reads every scalar leaf by pointer, or only the named tables", () => {
    const f = file("pyproject.toml", '[project]\nname = "p"\nrequires-python = ">=3.11"\ndependencies = ["a", "b/c"]\n[tool.x]\ny = 1\n');
    expect(tomlFields(f, ctx, tool).facts.map((x) => (x.kind === "field" ? [x.path, x.value] : []))).toEqual([
      ["/project/name", "p"],
      ["/project/requires-python", ">=3.11"],
      ["/project/dependencies/0", "a"],
      ["/project/dependencies/1", "b/c"],
      ["/tool/x/y", "1"],
    ]);
    expect(tomlFields(f, ctx, tool, ["project"]).facts).toHaveLength(4);
  });

  it("writes no fact for an empty manifest", () => {
    expect(tomlFields(file("pyproject.toml", "# nothing\n"), ctx, tool)).toEqual({ facts: [], diagnostics: [] });
  });

  it("reports a malformed manifest", () => {
    const out = tomlFields(file("Cargo.toml", "[package\n"), ctx, tool);
    expect(out.facts).toEqual([]);
    expect(out.diagnostics[0]!.code).toBe("malformed-manifest");
  });
});
