// facts-ts (Ingesting a codebase, stage 23): code facts from the bytes of the source files alone.
import { describe, expect, it } from "vitest";
import { digestOf } from "@csh/kernel";
import type { AdapterInput, Fact } from "@csh/witness";
import { packageOf, readFile, resolveRelative, run } from "../src/index.ts";

const input = (files: Record<string, string>, commit?: string): AdapterInput => ({
  source: { name: "Code", kind: "Code", at: "." },
  vocabulary: { units: [], enums: [], states: [], events: [] },
  bindings: [],
  files: Object.entries(files).map(([path, text]) => {
    const bytes = new TextEncoder().encode(text);
    return { path, digest: digestOf(bytes), bytes };
  }),
  ...(commit !== undefined ? { config: { commit } } : {}),
});

const show = (f: Fact): string => {
  switch (f.kind) {
    case "module":
      return `module ${f.name}`;
    case "depends":
      return `${f.at} ${f.from} -> ${f.to}${f.typeOnly ? " (type)" : ""}`;
    case "export":
      return `export ${f.module} ${f.symbol}${f.from !== undefined ? ` from ${f.from}` : ""}${f.typeOnly ? " (type)" : ""}`;
    case "field":
      return `field ${f.path} = ${f.value}`;
    case "skipped":
      return `skipped ${f.at} ${f.reason}`;
    case "declare":
      return `declare ${f.module} ${f.declares} ${f.symbol}${f.base !== undefined ? ` extends ${f.base}` : ""}${f.value !== undefined ? ` = ${f.value}` : ""}`;
    default:
      return f.kind;
  }
};

describe("facts-ts", () => {
  it("reads modules, dependencies, exports and manifest fields", () => {
    const out = run(
      input(
        {
          "package.json": JSON.stringify({ name: "p", engines: { node: ">=22" }, exports: { ".": "./dist/index.js", "./sde": { import: "./dist/sde.mjs" } }, scripts: { x: "y" } }),
          "src/core/a.ts": "import type { B } from './b.js';\nimport { readFileSync } from 'fs';\nexport const a = 1, { c } = { c: 2 };\nexport function f() {}\nexport default class {}\n",
          "src/core/b.ts": "import z from 'zod/v4';\nimport('./a');\nrequire(name);\nexport interface B {}\nexport * from './a';\nexport { a as aa } from './a';\nexport type { B as BB };\n",
          "src/index.ts": "import './core/missing';\nimport { x } from '@scope/pkg/sub';\nexport * as core from './core/index';\n",
          "src/core/index.ts": "export {};\n",
          "README.md": "not code",
        },
        "abc",
      ),
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.facts!.every((f) => f.schema === "csh-facts/v2" && f.subject.commit === "abc" && f.tool.id === "facts-ts")).toBe(true);
    expect(out.facts!.map(show)).toEqual([
      "field /name = p",
      "field /engines/node = >=22",
      "field /exports/. = ./dist/index.js",
      "field /exports/.~1sde/import = ./dist/sde.mjs",
      "field /scripts/x = y",
      "module src/core/a.ts",
      "src/core/a.ts:1 src/core/a.ts -> src/core/b.ts (type)",
      "src/core/a.ts:2 src/core/a.ts -> node:fs",
      "declare src/core/a.ts const a = 1",
      "declare src/core/a.ts const c",
      "declare src/core/a.ts function f",
      "declare src/core/a.ts class default",
      "export src/core/a.ts a",
      "export src/core/a.ts c",
      "export src/core/a.ts f",
      "export src/core/a.ts default",
      "module src/core/b.ts",
      "src/core/b.ts:1 src/core/b.ts -> zod",
      "src/core/b.ts:2 src/core/b.ts -> src/core/a.ts",
      "src/core/b.ts:5 src/core/b.ts -> src/core/a.ts",
      "src/core/b.ts:6 src/core/b.ts -> src/core/a.ts",
      "skipped src/core/b.ts:3 computed specifier",
      "declare src/core/b.ts interface B",
      "export src/core/b.ts B (type)",
      "export src/core/b.ts * from ./a",
      "export src/core/b.ts aa from ./a",
      "export src/core/b.ts BB (type)",
      "module src/core/index.ts",
      "module src/index.ts",
      "skipped src/index.ts:1 unresolved ./core/missing",
      "src/index.ts:2 src/index.ts -> @scope/pkg",
      "src/index.ts:3 src/index.ts -> src/core/index.ts",
      "export src/index.ts core from ./core/index",
    ]);
  });

  it("gives the same facts at two commits whose lockfiles differ, since it reads no lockfile", () => {
    const code = { "package.json": JSON.stringify({ name: "p" }), "src/a.ts": "import 'zod';\n" };
    const strip = (fs: Fact[]) => fs.map((f) => JSON.stringify({ ...f, subject: undefined }));
    const one = run(input({ ...code, "package-lock.json": "{\"lockfileVersion\":3}" }, "c1")).facts!;
    const two = run(input({ ...code, "package-lock.json": "{\"lockfileVersion\":2}" }, "c2")).facts!;
    expect(strip(one)).toEqual(strip(two));
  });

  it("says when it was given no commit, since such facts are never current", () => {
    expect(run(input({ "a.ts": "" })).diagnostics.map((d) => d.code)).toEqual(["no-commit"]);
  });

  it("resolves relative specifiers as a bundler would, and names packages and built-ins", () => {
    const files = new Set(["src/a.ts", "src/b/index.ts", "src/c.mts", "src/d.d.ts"]);
    expect(resolveRelative("src/x.ts", "./a.js", files)).toBe("src/a.ts");
    expect(resolveRelative("src/x.ts", "./b", files)).toBe("src/b/index.ts");
    expect(resolveRelative("src/x.ts", "./c.mjs", files)).toBe("src/c.mts");
    expect(resolveRelative("src/x.ts", "./d", files)).toBe("src/d.d.ts");
    expect(resolveRelative("src/b/index.ts", "../a", files)).toBe("src/a.ts");
    expect(resolveRelative("src/x.ts", "./none", files)).toBeUndefined();
    const more = new Set(["src/e.d.mts", "src/f.d.cts", "src/g/index.mts", "src/h/index.cts"]);
    expect(resolveRelative("src/x.ts", "./e.mjs", more)).toBe("src/e.d.mts");
    expect(resolveRelative("src/x.ts", "./f.cjs", more)).toBe("src/f.d.cts");
    expect(resolveRelative("src/x.ts", "./g", more)).toBe("src/g/index.mts");
    expect(resolveRelative("src/x.ts", "./h", more)).toBe("src/h/index.cts");
    expect(packageOf("node:fs/promises")).toBe("node:fs");
    expect(packageOf("path")).toBe("node:path");
    expect(packageOf("@a/b/c")).toBe("@a/b");
    expect(packageOf("zod/v4")).toBe("zod");
  });

  it("reads type-only imports, import types and import-equals", () => {
    const r = readFile("a.ts", "import { type A, type B } from './a';\nimport { type C, D } from './c';\nlet x: import('./t').T;\nimport fs = require('fs');\n");
    expect(r.refs).toEqual([
      { specifier: "./a", line: 1, typeOnly: true },
      { specifier: "./c", line: 2, typeOnly: false },
      { specifier: "./t", line: 3, typeOnly: true },
      { specifier: "fs", line: 4, typeOnly: false },
    ]);
  });
});

describe("declarations and data files (stage 24)", () => {
  it("reads what each top-level declaration declares, a class's base and a constant's literal value", () => {
    const out = run(
      input(
        {
          "src/e.ts": "class A extends Error {}\nexport class B extends ns.A<T> {}\nconst N = 3, S = `t`, X = f();\nlet l = 1;\nenum E { a }\nnamespace M {}\ntype T = 1;\nfunction g() { const inner = 1; }\n",
          "etc/metrics.json": JSON.stringify({ suites: 223, nested: { "a/b": [1, true, null] }, none: {}, nil: [] }),
        },
        "c",
      ),
    );
    expect(out.facts!.map(show)).toEqual([
      "field /suites = 223",
      "field /nested/a~1b/0 = 1",
      "field /nested/a~1b/1 = true",
      "field /nested/a~1b/2 = null",
      "field /none = {}",
      "field /nil = []",
      "module src/e.ts",
      "declare src/e.ts class A extends Error",
      "declare src/e.ts class B extends ns.A",
      "declare src/e.ts const N = 3",
      "declare src/e.ts const S = t",
      "declare src/e.ts const X",
      "declare src/e.ts let l",
      "declare src/e.ts enum E",
      "declare src/e.ts namespace M",
      "declare src/e.ts type T",
      "declare src/e.ts function g",
      "export src/e.ts B",
    ]);
  });
});

describe("what the audit of other repositories showed", () => {
  it("reads the script of a Svelte component at its own lines, and a component as a module", () => {
    const svelte = ["<h1>Hi</h1>", "<script lang=\"ts\">", "  import { a } from \"./a.ts\";", "  import B from \"./B.svelte\";", "</script>", "<B />", ""].join("\n");
    const out = run(input({ "src/C.svelte": svelte, "src/a.ts": "export const a = 1;\n", "src/B.svelte": "<p/>\n" }));
    const shown = (out.facts ?? []).map(show);
    expect(shown).toContain("module src/C.svelte");
    expect(shown).toContain("src/C.svelte:3 src/C.svelte -> src/a.ts");
    expect(shown).toContain("src/C.svelte:4 src/C.svelte -> src/B.svelte");
  });

  it("does not report SvelteKit's generated ./$types as unresolved", () => {
    const out = run(input({ "src/routes/+page.ts": "import type { PageLoad } from \"./$types\";\nexport const load: PageLoad = () => ({});\n" }));
    expect((out.facts ?? []).map(show).filter((x) => x.startsWith("skipped") || x.includes("$types"))).toEqual([]);
  });

  it("resolves a workspace package to its module when the source holds two or more packages", () => {
    const files = {
      "packages/core/package.json": JSON.stringify({ name: "@w/core", main: "dist/index.js" }),
      "packages/core/src/index.ts": "export const x = 1;\n",
      "packages/core/src/util.ts": "export const u = 1;\n",
      "packages/web/package.json": JSON.stringify({ name: "@w/web" }),
      "packages/web/src/app.ts": "import { x } from \"@w/core\";\nimport { u } from \"@w/core/util\";\nimport z from \"zod\";\n",
    };
    const shown = (run(input(files)).facts ?? []).map(show);
    expect(shown).toContain("packages/web/src/app.ts:1 packages/web/src/app.ts -> packages/core/src/index.ts");
    expect(shown).toContain("packages/web/src/app.ts:2 packages/web/src/app.ts -> packages/core/src/util.ts");
    expect(shown).toContain("packages/web/src/app.ts:3 packages/web/src/app.ts -> zod");
  });

  it("leaves a package's own name alone when the source is not a workspace", () => {
    const files = { "package.json": JSON.stringify({ name: "solo" }), "src/index.ts": "export {};\n", "src/b.ts": "import \"solo\";\n" };
    expect((run(input(files)).facts ?? []).map(show)).toContain("src/b.ts:1 src/b.ts -> solo");
  });
});

describe("YAML files", () => {
  it("are read as fields by pointer, so the entries of a list can be counted", () => {
    const out = run(input({ "m/mutants.yaml": "mutants:\n  - id: a\n  - id: b\n" }));
    const shown = (out.facts ?? []).map(show);
    expect(shown).toContain("field /mutants/0/id = a");
    expect(shown).toContain("field /mutants/1/id = b");
  });
});
