import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseFacts } from "@csh/facts";
import { importsOf, main, packageOf, scanWorkspace } from "../src/index.ts";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "facts-imports-"));
  dirs.push(root);
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
}

describe("the import scan", () => {
  it("reads imports, re-exports, type-only imports, require, dynamic import and import types", () => {
    const sites = importsOf("x.ts", [
      `import { a } from "@s/a";`,
      `import type { T } from "@s/b";`,
      `import { type U, type V } from "@s/c";`,
      `export * from "@s/d";`,
      `export type { W } from "@s/e";`,
      `const f = require("@s/f");`,
      `const g = await import("@s/g");`,
      `type H = import("@s/h").H;`,
      `const i = await import(name);`,
      `import "@s/j";`,
    ].join("\n"));
    expect(sites.map((s) => [s.spec ?? s.skipped, s.line, s.typeOnly])).toEqual([
      ["@s/a", 1, false],
      ["@s/b", 2, true],
      ["@s/c", 3, true],
      ["@s/d", 4, false],
      ["@s/e", 5, true],
      ["@s/f", 6, false],
      ["@s/g", 7, false],
      ["@s/h", 8, true],
      ["dynamic import of a computed specifier", 9, false],
      ["@s/j", 10, false],
    ]);
  });

  it("resolves a specifier to the workspace package it names, or a path inside it", () => {
    expect(packageOf("@s/a/reporter", ["@s/a", "@s/ab"])).toBe("@s/a");
    expect(packageOf("@s/abc", ["@s/a", "@s/ab"])).toBeUndefined();
  });

  it("writes package, manifest, import and skipped facts for a workspace, leaving tests and outside packages out", () => {
    const root = workspace({
      "pnpm-workspace.yaml": `packages:\n  - "packages/*"\n`,
      "packages/a/package.json": JSON.stringify({ name: "@s/a", dependencies: { "@s/b": "workspace:*", lodash: "1" } }),
      "packages/a/src/x.ts": `import { b } from "@s/b";\nimport _ from "lodash";\nimport { self } from "@s/a";\n`,
      "packages/a/test/x.test.ts": `import { c } from "@s/c";\n`,
      "packages/b/package.json": JSON.stringify({ name: "@s/b" }),
      "packages/b/bin/b.js": `await import(process.argv[2]);\n`,
      "packages/c/package.json": JSON.stringify({ name: "@s/c" }),
    });
    const facts = scanWorkspace(root, "abc");
    expect(facts.map((f) => (f.kind === "package" ? `package ${f.name}` : f.kind === "depends" ? `${f.from} -> ${f.to} ${f.via} ${f.at}` : `skipped ${f.from} ${f.at}`))).toEqual([
      "package @s/a",
      "package @s/b",
      "package @s/c",
      "@s/a -> @s/b manifest packages/a/package.json",
      "@s/a -> @s/b import packages/a/src/x.ts:1",
      "skipped @s/b packages/b/bin/b.js:1",
    ]);
    expect(facts.every((f) => f.subject.commit === "abc")).toBe(true);
  });

  it("stamps the commit the harness gives and writes the facts file", () => {
    const root = workspace({ "packages/a/package.json": JSON.stringify({ name: "a" }) });
    let said = "";
    expect(main(["--root", root], { out: (s) => (said += s), err: () => {}, cwd: root, env: { CSH_COMMIT: "c0ffee" } })).toBe(0);
    expect(said).toMatch(/1 packages, 0 dependencies, 0 skipped, at c0ffee/);
    const { facts, problems } = parseFacts(readFileSync(join(root, "reports/facts.ndjson"), "utf8"));
    expect(problems).toEqual([]);
    expect(facts.map((x) => x.fact.subject.commit)).toEqual(["c0ffee"]);
  });
});
