// Joining results from runners that name no file (stage 35): a Surefire or Gradle classname, a `go test -json` import
// path and a cargo-nextest binary id each join the one test file of the source that declares them, and a result that
// fits two files, or none, stays unmatched as before. Jest and Vitest results join exactly as they did.
import { describe, expect, it } from "vitest";
import { digestOf } from "@csh/kernel";
import type { AdapterInput } from "@csh/witness";
import { run as tests } from "../src/tests.ts";
import { cargoNames, goModule, javaDeclarations, rustModules, rustTestPaths } from "../src/tests-join.ts";

const input = (files: Record<string, string>, executions: Record<string, string>, config?: Record<string, string>): AdapterInput => {
  const f = (entries: Record<string, string>) =>
    Object.entries(entries).map(([path, text]) => {
      const bytes = new TextEncoder().encode(text);
      return { path, digest: digestOf(bytes), bytes };
    });
  return {
    source: { name: "S", kind: "TestFiles", at: "." },
    vocabulary: { units: [], enums: [], states: [], events: [] },
    bindings: [],
    files: f(files),
    ...(config !== undefined ? { config } : {}),
    executions: f(executions),
  };
};

/** A JUnit XML report of one suite, each case `[classname, name, outcome]`, as Surefire, Gradle and nextest write it. */
const junit = (suite: string, cases: [string, string, "passed" | "failed"][]) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites><testsuite name="${suite}" tests="${cases.length}">`,
    ...cases.map(([c, n, o]) => (o === "failed" ? `<testcase classname="${c}" name="${n}"><failure message="x"/></testcase>` : `<testcase classname="${c}" name="${n}"/>`)),
    "</testsuite></testsuites>",
  ].join("\n");

/** `go test -json` lines, each `[package, test, action]`. */
const gojson = (events: [string, string, string][]) => events.map(([p, t, a]) => JSON.stringify({ Action: a, Package: p, ...(t === "" ? {} : { Test: t }) })).join("\n");

const joined = (out: ReturnType<typeof tests>) => out.results!.map((r) => [r.file, r.outcome, r.cites]);
const diagnostic = (out: ReturnType<typeof tests>, code: string) => out.diagnostics.find((d) => d.code === code)?.message;

const BILLING = [
  "package com.shop;",
  "",
  "import org.junit.jupiter.api.*;",
  "",
  "/* class NotThis {} */",
  "class BillingTest {",
  "  @Test void testBILL_7() {}",
  "  @Nested class WhenEmpty { @Test void refuses() {} }",
  "}",
  "",
].join("\n");

describe("Java results (Surefire, Gradle)", () => {
  it("joins a classname to the file declaring its package and top-level class, nested and dotted forms too", () => {
    const report = junit("com.shop.BillingTest", [
      ["com.shop.BillingTest", "testBILL_7", "failed"],
      ["com.shop.BillingTest$WhenEmpty", "refuses()", "passed"],
      ["com.shop.BillingTest.WhenEmpty", "refuses()", "passed"],
    ]);
    const out = tests(input({ "billing/src/test/java/com/shop/BillingTest.java": BILLING }, { "TEST-com.shop.BillingTest.xml": report }));
    const file = "billing/src/test/java/com/shop/BillingTest.java";
    expect(joined(out)).toEqual([
      [file, "failed", ["BILL-7"]],
      [file, "passed", []],
      [file, "passed", []],
    ]);
    expect(out.items![0]!.attrs).toEqual({ tests: "2", passed: "2", failed: "1", errored: "0", skipped: "0" });
    expect(diagnostic(out, "results-unmatched")).toBeUndefined();
  });

  it("reads the joined name as the inventory reads it, so testBILL_7 cites BILL-7 only when the pattern cannot hold an underscore", () => {
    const report = junit("com.shop.BillingTest", [["com.shop.BillingTest", "testBILL_7", "failed"]]);
    const held = tests(input({ "BillingTest.java": BILLING }, { "r.xml": report }, { idPattern: "[A-Z_]+-[0-9]+" }));
    expect(joined(held)).toEqual([["BillingTest.java", "failed", []]]);
  });

  it("falls back to a single file whose path ends with the classname's, when no file declares it", () => {
    const out = tests(input({ "src/test/java/com/shop/CartTest.java": "// no package line the lexer can read\nclass Other { @Test void a() {} }\n" }, { "r.xml": junit("x", [["com.shop.CartTest", "testCART_1", "passed"]]) }));
    expect(joined(out)).toEqual([["src/test/java/com/shop/CartTest.java", "passed", ["CART-1"]]]);
  });

  it("leaves a classname two files declare unmatched, and says so", () => {
    const out = tests(input({ "a/src/test/java/com/shop/BillingTest.java": BILLING, "b/src/test/java/com/shop/BillingTest.java": BILLING }, { "r.xml": junit("x", [["com.shop.BillingTest", "testBILL_7", "failed"]]) }));
    expect(out.results).toEqual([]);
    expect(diagnostic(out, "results-unmatched")).toBe("1 results in 1 files name no test file of the source; 1 results in 1 of them name a class, package or test that more than one test file declares, and are not joined");
  });

  it("leaves a classname no file declares unmatched, as before", () => {
    const out = tests(input({ "BillingTest.java": BILLING }, { "r.xml": junit("x", [["com.shop.RefundTest", "testBILL_8", "failed"], ["org.shop.BillingTest", "testBILL_9", "failed"]]) }));
    expect(out.results).toEqual([]);
    expect(diagnostic(out, "results-unmatched")).toBe("2 results in 2 files name no test file of the source");
  });

  it("reads a Java file's package and top-level types from code only", () => {
    expect(javaDeclarations('package a . b;\n// class X {}\nString s = "class Y {}";\npublic final class C { class D {} }\n@interface Ann {}\nrecord R() {}\n')).toEqual({ pkg: "a.b", types: ["C", "R"] });
  });
});

describe("Go results (go test -json)", () => {
  const files = {
    "internal/billing/billing_test.go": "package billing\n\nfunc TestBILL_7(t *testing.T) {\n\tt.Run(\"empty\", func(t *testing.T) {})\n}\n",
    "internal/billing/refund_test.go": "package billing\n\nfunc TestRefund(t *testing.T) {}\n",
    "internal/billing/helpers_test.go": "package billing\n\nfunc helper() {}\n",
    "billing/other_test.go": "package billing\n\nfunc TestBILL_7(t *testing.T) {}\n",
  };

  it("joins an import path to the longest directory it ends with, and a test to the file declaring it", () => {
    const report = gojson([
      ["example.com/shop/internal/billing", "TestBILL_7/empty", "fail"],
      ["example.com/shop/internal/billing", "TestBILL_7", "fail"],
      ["example.com/shop/internal/billing", "TestRefund", "pass"],
      ["example.com/shop/internal/billing", "TestGone", "pass"],
      ["example.com/shop/internal/billing", "", "fail"],
    ]);
    const out = tests(input(files, { "go.json": report }));
    expect(joined(out)).toEqual([
      ["internal/billing/billing_test.go", "failed", ["BILL-7"]],
      ["internal/billing/billing_test.go", "failed", ["BILL-7"]],
      ["internal/billing/refund_test.go", "passed", []],
    ]);
    expect(diagnostic(out, "results-unmatched")).toBe("1 results in 1 files name no test file of the source");
  });

  it("maps an import path by the module line of a go.mod in the source, which is not a test file", () => {
    const withMod = { ...files, "go.mod": "// the module\nmodule example.com/shop\n\ngo 1.22\n" };
    const out = tests(input(withMod, { "go.json": gojson([["example.com/shop/billing", "TestBILL_7", "pass"]]) }));
    expect(joined(out)).toEqual([["billing/other_test.go", "passed", ["BILL-7"]]]);
    expect(out.items!.map((i) => i.id)).not.toContain("go.mod");
    expect(goModule('module "example.com/x" // quoted\n')).toBe("example.com/x");
  });

  it("leaves a test two files of the directory declare unmatched, and says so", () => {
    const twice = { "pkg/a_test.go": "func TestA(t *testing.T) {}\n", "pkg/b_test.go": "func TestA(t *testing.T) {}\n" };
    const out = tests(input(twice, { "go.json": gojson([["example.com/pkg", "TestA", "pass"]]) }));
    expect(out.results).toEqual([]);
    expect(diagnostic(out, "results-unmatched")).toContain("1 results in 1 of them name a class, package or test that more than one test file declares");
  });
});

describe("Rust results (cargo-nextest JUnit)", () => {
  const files = {
    "shop/Cargo.toml": '[package]\nname = "shop-core"\nversion = "0.1.0"\n\n[dependencies]\nname = "not this"\n',
    "shop/src/lib.rs": "pub fn add() {}\n\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn bill_7_adds() {}\n}\n",
    "shop/src/billing/mod.rs": "#[cfg(test)]\nmod tests {\n    #[test]\n    fn test_BILL_8() {}\n}\n",
    "shop/tests/checkout.rs": "mod common;\n\n#[test]\nfn test_BILL_9() {}\n",
    "shop/tests/checkout/common.rs": "#[test]\nfn shared() {}\n",
    "shop/src/main.rs": "#[test]\nfn test_BILL_10() {}\n",
  };

  it("joins a binary id and a module path to the one #[test] function under that path in that target", () => {
    const report = [
      junit("shop-core", [["shop-core", "tests::bill_7_adds", "passed"], ["shop-core", "billing::tests::test_BILL_8", "failed"]]),
      junit("shop-core::checkout", [["shop-core::checkout", "test_BILL_9", "passed"], ["shop-core::checkout", "common::shared", "passed"]]),
      junit("shop-core::bin/shop-core", [["shop-core::bin/shop-core", "test_BILL_10", "passed"]]),
    ];
    const out = tests(input(files, { "a.xml": report[0]!, "b.xml": report[1]!, "c.xml": report[2]! }));
    expect(joined(out)).toEqual([
      ["shop/src/lib.rs", "passed", []],
      ["shop/src/billing/mod.rs", "failed", ["BILL-8"]],
      ["shop/tests/checkout.rs", "passed", ["BILL-9"]],
      ["shop/tests/checkout/common.rs", "passed", []],
      ["shop/src/main.rs", "passed", ["BILL-10"]],
    ]);
    expect(out.items!.map((i) => i.id)).not.toContain("shop/Cargo.toml");
  });

  it("leaves a test under the wrong module, crate or target unmatched", () => {
    const report = junit("x", [
      ["shop-core", "test_BILL_8", "failed"],
      ["other", "tests::bill_7_adds", "failed"],
      ["shop-core::bin/shop-core", "tests::bill_7_adds", "failed"],
    ]);
    const out = tests(input(files, { "r.xml": report }));
    expect(out.results).toEqual([]);
    expect(diagnostic(out, "results-unmatched")).toBe("3 results in 3 files name no test file of the source");
  });

  it("with no Cargo.toml in the source, joins only when one file in any crate fits", () => {
    const two = { "a/src/lib.rs": "#[test]\nfn test_BILL_1() {}\n", "b/src/lib.rs": "#[test]\nfn test_BILL_1() {}\n", "b/tests/flow.rs": "#[test]\nfn test_BILL_2() {}\n" };
    const out = tests(input(two, { "r.xml": junit("x", [["a", "test_BILL_1", "passed"], ["b::flow", "test_BILL_2", "passed"]]) }));
    expect(joined(out)).toEqual([["b/tests/flow.rs", "passed", ["BILL-2"]]]);
    expect(diagnostic(out, "results-unmatched")).toContain("; 1 results in 1 of them name a class");
  });

  it("reads a crate's names, a file's module path and its tests' inline modules", () => {
    expect(cargoNames('[package]\nname = "a-b" # the package\n[lib]\nname = "ab"\n[[bin]]\nname = "c"\n')).toEqual(["a-b", "ab"]);
    expect(rustModules("src/a/b.rs", "x", undefined, undefined)).toEqual(["a", "b"]);
    expect(rustModules("src/main.rs", "x", undefined, undefined)).toBeUndefined();
    expect(rustModules("src/bin/tool/io.rs", "x", "bin", "tool")).toEqual(["io"]);
    expect(rustModules("tests/it/mod.rs", "x", undefined, "it")).toBeUndefined();
    expect(rustModules("tests/it/main.rs", "x", undefined, "it")).toEqual([]);
    expect(rustTestPaths('mod a {\n  mod b { #[test] fn c() {} }\n  // mod z { #[test] fn y() {} }\n  #[test] fn d() { let s = "}"; }\n}\n#[test]\nfn e() {}\n')).toEqual([["a", "b", "c"], ["a", "d"], ["e"]]);
  });
});

describe("results that name a file", () => {
  it("join TypeScript, Jest and Vitest results by path exactly as before, beside Java files", () => {
    const report = JSON.stringify({
      testResults: [
        { name: "/ci/test/a.test.ts", assertionResults: [{ fullName: "test_REQ_12 BillingTest", status: "failed" }] },
        { name: "/ci/test/gone.test.ts", assertionResults: [{ fullName: "REQ-2", status: "passed" }] },
      ],
    });
    const out = tests(input({ "test/a.test.ts": "it('x', () => {});\n", "gone/BillingTest.java": BILLING, "gone_test.go": "func TestA(t *testing.T) {}\n" }, { "r.json": report }));
    expect(joined(out)).toEqual([["test/a.test.ts", "failed", []]]);
    expect(diagnostic(out, "results-unmatched")).toBe("1 results in 1 files name no test file of the source");
  });

  it("keep pytest's path join", () => {
    const out = tests(input({ "tests/test_bill.py": "def test_BILL_3(): pass\n" }, { "r.xml": junit("pytest", [["tests.test_bill", "test_BILL_3", "passed"]]) }));
    expect(joined(out)).toEqual([["tests/test_bill.py", "passed", ["BILL-3"]]]);
  });
});
