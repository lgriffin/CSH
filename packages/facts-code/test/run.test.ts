// The Code adapter's dispatch (stage 29): TypeScript is read by facts-ts exactly as before, a source file in a language
// with no reader is a skipped fact, and every grammar parses (packages/run/test/grammars.test.ts loads them in the sandbox).
import { describe, expect, it } from "vitest";
import { run as runTs } from "@csh/facts-ts";
import type { AdapterInput } from "@csh/witness";
import { GRAMMARS, languageOf, parse, run, type LanguageReader } from "../src/index.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const input = (files: Record<string, string>): AdapterInput => ({
  source: { name: "Code", kind: "Code", at: "." },
  vocabulary: { units: [], enums: [], states: [], events: [] },
  bindings: [],
  files: Object.entries(files).map(([path, text]) => ({ path, digest: "", bytes: enc(text) })),
  config: { commit: "c1" },
});

describe("languageOf", () => {
  it("names the language of a source file, and nothing for TypeScript, JavaScript or data", () => {
    expect(["a.py", "b.pyi", "C.java", "d.go", "e.rs", "f.kt", "g.cpp"].map(languageOf)).toEqual(["python", "python", "java", "go", "rust", "kotlin", "c++"]);
    expect(["a.ts", "b.js", "package.json", "README.md", "Makefile", ".py", "constructor"].map(languageOf)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
  });
});

describe("run", () => {
  it("reads TypeScript, JSON and YAML as facts-ts does", async () => {
    const files = { "src/a.ts": "import { b } from './b';\nexport const a = b;\n", "src/b.ts": "export const b = 1;\n", "package.json": '{"name":"x","scripts":{"t":"vitest"}}', "c.yaml": "k: v\n" };
    const out = await run(input(files));
    expect(out.facts).toEqual(runTs(input(files)).facts);
    expect(out.diagnostics).toEqual([]);
  });

  it("writes a skipped fact for each source file in a language with no reader", async () => {
    const out = await run(input({ "app/main.py": "import os\n", "Main.kt": "fun main() {}\n", "src/a.ts": "export {};\n" }), []);
    const skipped = out.facts!.filter((f) => f.kind === "skipped");
    expect(skipped.map((f) => [f.at, f.kind === "skipped" ? f.reason : "", f.tool.id])).toEqual([
      ["Main.kt", "no reader for kotlin", "facts-code"],
      ["app/main.py", "no reader for python", "facts-code"],
    ]);
    expect(out.facts!.some((f) => f.kind === "module" && f.name === "src/a.ts")).toBe(true);
  });

  it("hands a reader its own code and manifests, and nothing to facts-ts", async () => {
    const seen: string[] = [];
    const reader: LanguageReader = {
      language: "python",
      manifest: (p) => p.endsWith("pyproject.toml"),
      read: async (files, ctx) => {
        seen.push(...files.map((f) => f.path));
        return { facts: files.map((f) => ({ ...ctx.base({ id: "facts-py", version: "0" }), kind: "module" as const, at: f.path, name: f.path, language: "python" })), diagnostics: [] };
      },
    };
    const out = await run(input({ "pkg/a.py": "", "pyproject.toml": "[project]\n", "package.json": '{"name":"x"}' }), [reader]);
    expect(seen).toEqual(["pkg/a.py", "pyproject.toml"]);
    expect(out.facts!.filter((f) => f.tool.id === "facts-py").every((f) => f.subject.commit === "c1")).toBe(true);
    expect(out.facts!.some((f) => f.kind === "field" && f.file === "package.json")).toBe(true);
  });
});

describe("grammars", () => {
  it.each(Object.keys(GRAMMARS) as (keyof typeof GRAMMARS)[])("%s parses", async (language) => {
    const text = { python: "import os\n", java: "class A {}\n", go: "package a\n", rust: "fn main() {}\n" }[language];
    const root = await parse(language, text);
    expect(root.hasError).toBe(false);
    expect(root.namedChildCount).toBe(1);
  });
});
