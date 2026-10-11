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
      "module src/core/a.ts",
      "src/core/a.ts:1 src/core/a.ts -> src/core/b.ts (type)",
      "src/core/a.ts:2 src/core/a.ts -> node:fs",
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
