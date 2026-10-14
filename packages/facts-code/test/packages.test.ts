// Packages (stage 58): a package per Maven module, Go module, crate and Python distribution, and the dependencies
// between them, from what the readers wrote.
import { describe, expect, it } from "vitest";
import type { AdapterInput, Fact } from "@csh/witness";
import { run } from "../src/index.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const input = (files: Record<string, string>): AdapterInput => ({
  source: { name: "Code", kind: "Code", at: "." },
  vocabulary: { units: [], enums: [], states: [], events: [] },
  bindings: [],
  files: Object.entries(files).map(([path, text]) => ({ path, digest: "", bytes: enc(text) })),
  config: { commit: "c1" },
});
const read = async (files: Record<string, string>) => (await run(input(files))).facts ?? [];
const packages = (facts: Fact[]) => facts.flatMap((f) => (f.kind === "package" ? [`${f.name} ${f.at}`] : []));
const between = (facts: Fact[], names: Set<string>) => facts.flatMap((f) => (f.kind === "depends" && names.has(f.from) ? [`${f.from} -> ${f.to} ${f.via} ${f.at}`] : []));

const pom = (artifact: string, body = "") => `<project><modelVersion>4.0.0</modelVersion><artifactId>${artifact}</artifactId>${body}</project>`;
const dep = (artifact: string, scope?: string) => `<dependency><groupId>g</groupId><artifactId>${artifact}</artifactId>${scope !== undefined ? `<scope>${scope}</scope>` : ""}</dependency>`;

describe("packages", () => {
  it("reads Maven modules, leaves an aggregator out, and ignores a test-scoped dependency", async () => {
    const facts = await read({
      "pom.xml": `<project><artifactId>parent</artifactId><packaging>pom</packaging></project>`,
      "a/pom.xml": pom("a", `<dependencies>${dep("b")}${dep("c", "test")}</dependencies>`),
      "b/pom.xml": pom("b"),
      "c/pom.xml": pom("c"),
      "a/src/main/java/x/A.java": "package x;\nimport y.B;\nclass A {}\n",
      "b/src/main/java/y/B.java": "package y;\npublic class B {}\n",
      "c/src/main/java/z/C.java": "package z;\npublic class C {}\n",
    });
    expect(packages(facts)).toEqual(["a a/pom.xml", "b b/pom.xml", "c c/pom.xml"]);
    expect(between(facts, new Set(["a", "b", "c"]))).toEqual(["a -> b import a/src/main/java/x/A.java:2", "a -> b manifest a/pom.xml"]);
  });

  it("reads Go modules, a module path imported without a go.work, and its requirements", async () => {
    const facts = await read({
      "core/go.mod": "module example.com/core\n\ngo 1.22\n\nrequire example.com/db v0.0.0\n",
      "db/go.mod": "module example.com/db\n\ngo 1.22\n",
      "core/order.go": 'package core\n\nimport "example.com/db/tables"\n\nvar T = tables.Name\n',
      "db/tables/tables.go": 'package tables\n\nconst Name = "orders"\n',
    });
    expect(packages(facts)).toEqual(["example.com/core core/go.mod", "example.com/db db/go.mod"]);
    expect(between(facts, new Set(["example.com/core"]))).toEqual(["example.com/core -> example.com/db import core/order.go:3", "example.com/core -> example.com/db manifest core/go.mod"]);
  });

  it("reads crates by name with hyphens and underscores alike, and no workspace manifest", async () => {
    const facts = await read({
      "Cargo.toml": '[workspace]\nmembers = ["a", "b"]\n',
      "a/Cargo.toml": '[package]\nname = "shop-a"\nversion = "0.1.0"\n\n[dependencies]\nshop_b = { path = "../b" }\n\n[dev-dependencies]\nshop-c = "1"\n',
      "b/Cargo.toml": '[package]\nname = "shop-b"\nversion = "0.1.0"\n',
      "a/src/lib.rs": "use shop_b::X;\npub fn f() -> u8 { X }\n",
      "b/src/lib.rs": "pub const X: u8 = 1;\n",
    });
    expect(packages(facts)).toEqual(["shop-a a/Cargo.toml", "shop-b b/Cargo.toml"]);
    expect(between(facts, new Set(["shop-a"]))).toEqual(["shop-a -> shop-b import a/src/lib.rs:1", "shop-a -> shop-b manifest a/Cargo.toml"]);
  });

  it("reads Python distributions, their dependency names without versions, and files under the nearest manifest", async () => {
    const facts = await read({
      "pyproject.toml": '[project]\nname = "Shop.Root"\n',
      "libs/core/pyproject.toml": '[project]\nname = "shop-core"\ndependencies = ["Shop_Root >= 1", "requests"]\n',
      "libs/core/src/shop_core/__init__.py": "",
      "libs/core/src/shop_core/a.py": "import shop\n",
      "src/shop/__init__.py": "",
    });
    expect(packages(facts)).toEqual(["shop-core libs/core/pyproject.toml", "Shop.Root pyproject.toml"]);
    expect(between(facts, new Set(["shop-core"]))).toEqual(["shop-core -> Shop.Root import libs/core/src/shop_core/a.py:1", "shop-core -> Shop.Root manifest libs/core/pyproject.toml"]);
  });

  it("writes no package for a source with one, and none for npm, which a harness reads", async () => {
    expect(packages(await read({ "go.mod": "module example.com/one\n\ngo 1.22\n", "a.go": "package one\n" }))).toEqual([]);
    expect(packages(await read({ "a/package.json": '{"name":"a"}', "b/package.json": '{"name":"b"}', "a/x.ts": "export const x = 1;\n" }))).toEqual([]);
  });

  it("writes the same facts in any file order", async () => {
    const files = { "a/pom.xml": pom("a", `<dependencies>${dep("b")}</dependencies>`), "b/pom.xml": pom("b"), "a/A.java": "package x;\nimport y.B;\nclass A {}\n", "b/B.java": "package y;\npublic class B {}\n" };
    const reversed = Object.fromEntries(Object.entries(files).reverse());
    expect(await read(reversed)).toEqual(await read(files));
  });
});
