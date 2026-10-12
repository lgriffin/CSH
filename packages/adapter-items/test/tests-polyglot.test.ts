// The test-file inventory for Python, Java, Go and Rust (stage 35): each runner's convention decides what a test is,
// and what cites is what the runner reports or the author attaches to a test. Nothing in a comment or a string counts.
import { describe, expect, it } from "vitest";
import { digestOf } from "@csh/kernel";
import type { AdapterInput } from "@csh/witness";
import { run as tests } from "../src/tests.ts";
import { lexOther, underscoreFree } from "../src/tests-other.ts";

const input = (files: Record<string, string>, config?: Record<string, string>, executions?: Record<string, string>): AdapterInput => {
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
    ...(executions !== undefined ? { executions: f(executions) } : {}),
  };
};

const read = (path: string, text: string, config?: Record<string, string>) => {
  const out = tests(input({ [path]: text }, config));
  return { attrs: out.items![0]!.attrs, cites: (out.edges ?? []).map((e) => [e.to, e.span]), diagnostics: out.diagnostics.map((d) => d.code) };
};

describe("Python test files", () => {
  const file = [
    '"""Module docstring: def test_FAKE_1(): is not code."""', // 1
    "import pytest", // 2
    "", // 3
    "# def test_comment_REQ_90(): a comment", // 4
    "FIXTURE = '''", // 5
    "def test_in_string_REQ_91():", // 6
    "    pass", // 7
    "'''", // 8
    "", // 9
    "def test_REQ_12_rejects_empty():", // 10
    '    """', // 11
    "    REQ-13: an empty body is refused.", // 12
    "", // 13
    '    Not REQ-92: only the first line cites."""', // 14
    "    assert True", // 15
    "", // 16
    '@pytest.mark.requirement("REQ-14")', // 17
    "@pytest.mark.parametrize(", // 18
    '    "value, REQ_93",', // 19
    '    [(1, "REQ-94"), pytest.param(2, "x", id="REQ-15 two")],', // 20
    '    ids=["REQ-16 one", "two"],', // 21
    ")", // 22
    "async def test_parametrised(value):", // 23
    "    def test_nested_REQ_95():", // 24
    "        pass", // 25
    "", // 26
    '@pytest.mark.tag("REQ-17")', // 27
    "class TestLogin:", // 28
    '    @pytest.mark.skip(reason="later")', // 29
    "    def test_skipped(self):", // 30
    "        pass", // 31
    "", // 32
    "    def helper_REQ_96(self):", // 33
    "        pass", // 34
    "", // 35
    "class Helpers:", // 36
    "    def test_not_collected_REQ_97(self):", // 37
    "        pass", // 38
    "", // 39
    "class LoginCase(unittest.TestCase):", // 40
    "    def test_REQ_18(self): pass", // 41
    "", // 42
    "def test_mismatch_req_12_and_REQ12():", // 43
    "    pass", // 44
  ].join("\n");

  it("counts pytest's functions once each, and cites from names, docstrings, markers and ids", () => {
    const out = read("tests/test_login.py", file);
    expect(out.attrs).toEqual({ tests: "5", skipped: "1" });
    expect(out.cites).toEqual([
      ["REQ-12", "tests/test_login.py:10"],
      ["REQ-13", "tests/test_login.py:12"],
      ["REQ-14", "tests/test_login.py:17"],
      ["REQ-15", "tests/test_login.py:20"],
      ["REQ-16", "tests/test_login.py:21"],
      ["REQ-17", "tests/test_login.py:27"],
      ["REQ-18", "tests/test_login.py:41"],
    ]);
  });

  it("reads a name as written when the pattern could hold an underscore", () => {
    expect(underscoreFree("[A-Z]+-[0-9]+")).toBe(true);
    expect(underscoreFree("(?!(?:SHA|UTF|MD|AES|CRC|TLS|SSL|ISO)-[0-9])[A-Z][A-Z0-9]*-[0-9]+")).toBe(true);
    expect(underscoreFree("[A-Z_]+-[0-9]+")).toBe(false);
    expect(underscoreFree("\\w+-[0-9]+")).toBe(false);
    expect(underscoreFree("[^ ]+")).toBe(false);
    expect(read("t_test.py", "def test_REQ_12(): pass\n", { idPattern: "[A-Z_]+-[0-9]+" }).cites).toEqual([]);
    expect(read("t_test.py", "def test_REQ_12(): pass\n", { idPattern: "[A-Z_]+_[0-9]+" }).cites).toEqual([["REQ_12", "t_test.py:1"]]);
  });

  it("says when a file declares no test", () => {
    expect(read("conftest.py", "import pytest\n\n@pytest.fixture\ndef client():\n    return 1\n").diagnostics).toEqual(["no-tests"]);
  });
});

describe("Java test files", () => {
  const file = [
    "package com.example;", // 1
    "", // 2
    "import org.junit.jupiter.api.*;", // 3
    "", // 4
    '@DisplayName("REQ-20 login")', // 5
    '@Tag("REQ-21")', // 6
    "class LoginTest {", // 7
    '    private static final String SRC = """', // 8
    "        @Test void REQ_90_inTextBlock() {}", // 9
    '        """;', // 10
    '    private final char c = \'"\';', // 11
    "    // @Test void REQ_91_commented() {}", // 12
    "    /* @Test void REQ_92_block() {} */", // 13
    "", // 14
    "    @Test", // 15
    "    void REQ_22_rejectsEmpty() {}", // 16
    "", // 17
    "    @ParameterizedTest(name = \"REQ-93 {0}\")", // 18
    '    @ValueSource(strings = {"REQ-94"})', // 19
    '    @DisplayName("REQ-23 each value")', // 20
    "    public void values(String s) {}", // 21
    "", // 22
    '    @org.junit.Test(expected = IllegalStateException.class)', // 23
    "    public void testREQ_24() throws Exception {}", // 24
    "", // 25
    "    @RepeatedTest(3) @Disabled", // 26
    '    @Tags({@Tag("REQ-25"), @Tag("fast")})', // 27
    "    <T> List<T> repeated() { return null; }", // 28
    "", // 29
    "    @TestFactory", // 30
    "    Stream<DynamicTest> dynamic() { return Stream.of(); }", // 31
    "", // 32
    "    @BeforeEach void setUp_REQ_95() {}", // 33
    "    void helper_REQ_96() {}", // 34
    "    @Test void mismatch_req_26_and_REQ26() {}", // 35
    "}", // 36
    "", // 37
    '@DisplayName("REQ-97 holds no test")', // 38
    "class Helpers { void x() {} }", // 39
  ].join("\n");

  it("counts JUnit's annotated methods, and cites from names, display names and tags", () => {
    const out = read("src/test/java/com/example/LoginTest.java", file);
    expect(out.attrs).toEqual({ tests: "6", skipped: "1" });
    expect(out.cites.map(([to, span]) => [to, span!.split(":")[1]])).toEqual([
      ["REQ-20", "5"],
      ["REQ-21", "6"],
      ["REQ-22", "16"],
      ["REQ-23", "20"],
      ["REQ-24", "24"],
      ["REQ-25", "27"],
    ]);
  });

  it("counts a disabled class's tests as skipped", () => {
    const out = read("A.java", "@Ignore\npublic class A {\n  @Test public void a() {}\n  @Test public void b() {}\n}\n");
    expect(out.attrs).toEqual({ tests: "2", skipped: "2" });
  });
});

describe("Go test files", () => {
  const file = [
    "package login", // 1
    "", // 2
    'import "testing"', // 3
    "", // 4
    "const src = `", // 5
    "func TestREQ_90InRawString(t *testing.T) {}", // 6
    "`", // 7
    "", // 8
    "// func TestREQ_91Commented(t *testing.T) {}", // 9
    "/* func TestREQ_92Block(t *testing.T) {} */", // 10
    "", // 11
    "func TestREQ_30_Rejects(t *testing.T) {", // 12
    "\tcases := []string{\"REQ-93\"}", // 13
    '\tt.Run("REQ-31 empty", func(t *testing.T) {', // 14
    '\t\tt.Run(`REQ-32 nested`, func(st *testing.T) {', // 15
    '\t\t\tst.Run("REQ-33 deeper", nil)', // 16
    "\t\t})", // 17
    "\t})", // 18
    '\tserver.Run("REQ-94 not a subtest")', // 19
    "\t_ = cases", // 20
    "}", // 21
    "", // 22
    "func Test_REQ_34(t *testing.T) {}", // 23
    "", // 24
    "func FuzzREQ_35(f *testing.F) {}", // 25
    "", // 26
    "func ExampleREQ_36() {", // 27
    "\tfmt.Println(1)", // 28
    "\t// Output: 1", // 29
    "}", // 30
    "", // 31
    "func ExampleREQ_95NoOutput() {}", // 32
    "func BenchmarkREQ_96(b *testing.B) {}", // 33
    "func TestMain(m *testing.M) {}", // 34
    "func Testing(t *testing.T) {}", // 35
    "func (s *Suite) TestREQ_97Method(t *testing.T) {}", // 36
    "func TestMismatch_req_37(t *testing.T) {}", // 37
  ].join("\n");

  it("counts Test, Fuzz and run Example functions, and cites from names and subtest names", () => {
    const out = read("login/login_test.go", file);
    expect(out.attrs).toEqual({ tests: "5" });
    expect(out.cites.map(([to, span]) => [to, span!.split(":")[1]])).toEqual([
      ["REQ-30", "12"],
      ["REQ-31", "14"],
      ["REQ-32", "15"],
      ["REQ-33", "16"],
      ["REQ-34", "23"],
      ["REQ-35", "25"],
      ["REQ-36", "27"],
    ]);
  });

  it("cites from the doc comment lines immediately above a test, not past a blank line or code (F125)", () => {
    const text = [
      "package cart", // 1
      "", // 2
      "// REQ-80 is not a doc comment: a blank line follows.", // 3
      "", // 4
      "// TestAdd checks REQ-81:", // 5
      "//   adding an item puts it in the cart (REQ-82).", // 6
      "func TestAdd(t *testing.T) {}", // 7
      "", // 8
      "var x = 1 // REQ-83 trails code", // 9
      "func TestB(t *testing.T) {}", // 10
      "", // 11
      "// helper names REQ-84, and is no test.", // 12
      "func helper(t *testing.T) {}", // 13
    ].join("\n");
    expect(read("cart/cart_test.go", text).cites.map(([to, span]) => [to, span!.split(":")[1]])).toEqual([
      ["REQ-81", "5"],
      ["REQ-82", "6"],
    ]);
  });

  it("finds no test in a file that is not a _test.go file", () => {
    expect(read("login/login.go", "func TestX(t *testing.T) {}\n")).toMatchObject({ attrs: { tests: "0" }, diagnostics: ["no-tests"] });
  });
});

describe("Rust test files", () => {
  const file = [
    "//! REQ-40: the crate's login rules.", // 1
    "", // 2
    'const SRC: &str = r#"', // 3
    "#[test]", // 4
    "fn req_in_raw_string_REQ_90() {}", // 5
    '"#;', // 6
    "", // 7
    "/* outer /* nested */", // 8
    "#[test] fn REQ_91_in_nested_comment() {}", // 9
    "*/", // 10
    "", // 11
    "#[cfg(test)]", // 12
    "mod tests {", // 13
    "    use super::*;", // 14
    "", // 15
    "    /// REQ-41: an empty password is refused.", // 16
    "    /// Second line REQ-42 still above it.", // 17
    "    #[test]", // 18
    "    fn REQ_43_rejects_empty() {", // 19
    "        let c = '\"';", // 20
    "        let s = \"fn REQ_92_in_string() {}\";", // 21
    "        fn helper<'a>(x: &'a str) -> &'a str { x }", // 22
    "    }", // 23
    "", // 24
    "    /// REQ-93 is not directly above: a blank line parts it.", // 25
    "", // 26
    "    #[tokio::test]", // 27
    "    /// REQ-44 between attributes.", // 28
    "    #[ignore]", // 29
    "    pub(crate) async fn async_case() {}", // 30
    "", // 31
    "    #[rstest]", // 32
    "    #[case(vec![1, 2])]", // 33
    "    #[case(vec![3])]", // 34
    "    fn cases(#[case] v: Vec<u8>) {}", // 35
    "", // 36
    "    //// REQ-94: four slashes is a plain comment.", // 37
    "    #[test]", // 38
    "    fn test_REQ_45() {}", // 39
    "", // 40
    "    /// REQ-95 documents a helper, not a test.", // 41
    "    fn helper_REQ_96() {}", // 42
    "    #[test] fn mismatch_req_46() {}", // 43
    "}", // 44
  ].join("\n");

  it("counts #[test], #[...::test] and #[rstest] functions, and cites from names and doc comments", () => {
    const out = read("src/login.rs", file);
    expect(out.attrs).toEqual({ tests: "5", skipped: "1" });
    expect(out.cites.map(([to, span]) => [to, span!.split(":")[1]])).toEqual([
      ["REQ-41", "16"],
      ["REQ-42", "17"],
      ["REQ-43", "19"],
      ["REQ-44", "28"],
      ["REQ-45", "39"],
    ]);
  });

  it("reads an inner doc comment immediately above a test, and keeps doc comments the lexer blanks", () => {
    const out = read("tests/a.rs", "//! REQ-47 inner\n#[test]\nfn a() {}\n");
    expect(out.cites).toEqual([["REQ-47", "tests/a.rs:1"]]);
    const lexed = lexOther("/// REQ-48\nfn a() {}\n", "rust");
    expect(lexed.code.startsWith("          \nfn a()")).toBe(true);
    expect([...lexed.comments.values()]).toEqual(["/// REQ-48"]);
  });
});

describe("the inventory across languages", () => {
  it("leaves TypeScript files to the TypeScript reader and joins results by path", () => {
    const files = { "a.test.ts": "it('REQ-1 x', () => {});\n", "tests/test_a.py": "def test_REQ_2(): pass\n", "pkg/a_test.go": "func TestA(t *testing.T) {}\n", "A.java": "class A { @Test void b() {} }\n", "src/lib.rs": "#[test]\nfn c() {}\n" };
    const report = JSON.stringify({
      testResults: [
        { name: "/ci/tests/test_a.py", assertionResults: [{ fullName: "test_REQ_2 REQ-2", status: "passed" }] },
        { name: "/ci/pkg/a_test.go", assertionResults: [{ fullName: "TestA", status: "failed" }] },
      ],
    });
    const out = tests(input(files, undefined, { "results.json": report }));
    expect(out.items!.map((i) => [i.id, i.attrs])).toEqual([
      ["A.java", { tests: "1" }],
      ["a.test.ts", { tests: "1" }],
      ["pkg/a_test.go", { tests: "1", passed: "0", failed: "1", errored: "0", skipped: "0" }],
      ["src/lib.rs", { tests: "1" }],
      ["tests/test_a.py", { tests: "1", passed: "1", failed: "0", errored: "0", skipped: "0" }],
    ]);
    expect((out.edges ?? []).map((e) => [e.from, e.to])).toEqual([["a.test.ts", "REQ-1"], ["tests/test_a.py", "REQ-2"]]);
    expect(out.results!.map((r) => [r.file, r.outcome, r.cites])).toEqual([["tests/test_a.py", "passed", ["REQ-2"]], ["pkg/a_test.go", "failed", []]]);
  });

  it("cites from every string of the file with citeBodies, and never from a comment", () => {
    const text = 'def test_a():\n    for r in ["REQ-3"]:\n        pass  # REQ-4\n';
    expect(read("test_b.py", text, { citeBodies: "true" }).cites).toEqual([["REQ-3", "test_b.py:2"]]);
  });

  it("is deterministic whatever order the files come in", () => {
    const a = { "b_test.go": "func TestREQ_1(t *testing.T) {}\n", "a.rs": "/// REQ-2\n#[test]\nfn x() {}\n" };
    const b = { "a.rs": a["a.rs"], "b_test.go": a["b_test.go"] };
    expect(tests(input(a))).toEqual(tests(input(b)));
  });
});

describe("review findings", () => {
  const jest = (file: string, fullName: string) => JSON.stringify({ testResults: [{ name: file, assertionResults: [{ fullName, status: "passed" }] }] });

  it("reads a polyglot result's name as the inventory reads the test's name, and a TypeScript one as written", () => {
    const py = tests(input({ "tests/test_a.py": "def test_REQ_12(): pass\n" }, undefined, { "r.json": jest("/ci/tests/test_a.py", "test_REQ_12") }));
    expect(py.results!.map((r) => r.cites)).toEqual([["REQ-12"]]);
    const go = tests(input({ "a_test.go": "func TestREQ_13(t *testing.T) {}\n" }, undefined, { "r.json": jest("/ci/a_test.go", "TestREQ_13") }));
    expect(go.results!.map((r) => r.cites)).toEqual([["REQ-13"]]);
    const ts = tests(input({ "a.test.ts": "it('x', () => {});\n" }, undefined, { "r.json": jest("/ci/a.test.ts", "test_REQ_12") }));
    expect(ts.results!.map((r) => r.cites)).toEqual([[]]);
    const held = tests(input({ "tests/test_a.py": "def test_REQ_12(): pass\n" }, { idPattern: "[A-Z_]+-[0-9]+" }, { "r.json": jest("/ci/tests/test_a.py", "test_REQ_12") }));
    expect(held.results!.map((r) => r.cites)).toEqual([[]]);
  });

  it("does not count a pytest fixture named test_*", () => {
    const text = ["import pytest", "from pytest import fixture", "", "@pytest.fixture", "def test_client(): return 1", "", '@pytest.fixture(scope="module")', "def test_db(): return 2", "", "@fixture", "def test_app(): return 3", "", "def test_real(test_client): pass", ""].join("\n");
    expect(read("test_f.py", text).attrs).toEqual({ tests: "1" });
  });

  it("does not count the tests of a class that sets __test__ = False", () => {
    const text = ["class TestBase:", "    __test__ = False", "", "    def test_REQ_20(self): pass", "", "class TestReal:", "    def test_REQ_21(self): pass", ""].join("\n");
    expect(read("test_c.py", text)).toMatchObject({ attrs: { tests: "1" }, cites: [["REQ-21", "test_c.py:7"]] });
  });

  it("does not count a Test class with __init__, unless it is a TestCase", () => {
    const text = [
      "class TestWithInit:",
      "    def test_REQ_22(self): pass",
      "    def __init__(self): pass",
      "",
      "class Case(unittest.TestCase):",
      "    def __init__(self, *a): super().__init__(*a)",
      "    def test_REQ_23(self): pass",
      "",
    ].join("\n");
    expect(read("test_i.py", text)).toMatchObject({ attrs: { tests: "1" }, cites: [["REQ-23", "test_i.py:7"]] });
  });

  it("does not count a Go Test function with a result", () => {
    const text = ["func TestCheck(t *testing.T) int {", "\treturn 1", "}", "func TestOk(t *testing.T) {}", "func ExampleE() (n int) {", "\t// Output: 1", "\treturn", "}", ""].join("\n");
    expect(read("a_test.go", text).attrs).toEqual({ tests: "1" });
  });

  it("does not hyphenate when the pattern names a character by code or refers back", () => {
    for (const p of ["REQ\\x5f[0-9]+", "REQ\\u005f[0-9]+", "REQ\\u{5f}[0-9]+", "REQ\\137[0-9]+", "REQ\\cA", "(R)\\1", "(?<a>R)\\k<a>"]) expect(underscoreFree(p)).toBe(false);
    expect(underscoreFree("REQ-\\d+\\b")).toBe(true);
    expect(read("test_x.py", "def test_REQ_12(): pass\n", { idPattern: "REQ\\x5f[0-9]+" }).cites).toEqual([["REQ_12", "test_x.py:1"]]);
  });
});
