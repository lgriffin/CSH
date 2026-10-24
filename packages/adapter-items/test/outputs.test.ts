// Accepted outputs paired by path (Reading test suites as evidence, section 2; A-263): the edges of each convention
// that the fixtures F210 to F216 do not reach.
import { describe, expect, it } from "vitest";
import { goTestFunctions, instaName, instaSource, javaDeclares, outputDirsOf, pythonTestNames, run, rustSnapshotNames, snapshotEntries, snapshotKeys, suiteFilesOf, syrupyKeys, syrupyName, testFunctionOf, testFunctionsOf, testStemOf } from "../src/outputs.ts";
import { testNames } from "../src/tests.ts";
import { outputGaps } from "../../check/src/outputs.ts";

const dir = (paths: string[], d: string) => outputDirsOf(paths).find((o) => o.dir === d);

describe("reference trees", () => {
  it("pairs cases with their baselines by stem, the longest winning, at any depth", () => {
    const o = dir(["t/baselines/reference/s/a.types", "t/baselines/reference/s/a.b(x=1).js", "t/cases/s/deep/a.ts", "t/cases/s/a.b.ts"], "t/baselines/reference/s")!;
    expect(o.conventions).toEqual(["reference tree"]);
    expect(o.caseDir).toBe("t/cases/s");
    expect(o.paired.get("t/cases/s/deep/a.ts")).toEqual(["t/baselines/reference/s/a.types"]);
    expect(o.paired.get("t/cases/s/a.b.ts")).toEqual(["t/baselines/reference/s/a.b(x=1).js"]);
  });

  it("leaves a file directly in the tree, and a tree with no cases directory, unpaired", () => {
    const os = outputDirsOf(["baselines/reference/readme.txt", "baselines/reference/s/a.types"]);
    expect(os.map((o) => [o.dir, o.unpaired, o.why])).toEqual([
      ["baselines/reference", ["baselines/reference/readme.txt"], "a file directly in the reference tree belongs to no suite"],
      ["baselines/reference/s", ["baselines/reference/s/a.types"], "no namesake case directory"],
    ]);
  });

  it("reports two cases of one stem as shared, neither unaccepted, even with no output", () => {
    const o = dir(["baselines/reference/s/other.types", "cases/s/a.ts", "cases/s/x/a.ts", "cases/s/other.ts"], "baselines/reference/s")!;
    expect(o.shared).toEqual([{ stem: "cases/s/a", cases: ["cases/s/a.ts", "cases/s/x/a.ts"], outputs: [] }]);
    expect(o.unaccepted).toEqual([]);
  });
});

describe("mirrored directories", () => {
  it("pairs only at the same path below each root", () => {
    const o = dir(["tests/input/a/x.json", "tests/input/b/x.json", "tests/expected/a/x.html"], "tests")!;
    expect([...o.paired.keys()]).toEqual(["tests/input/a/x.json"]);
    expect(o.unaccepted).toEqual(["tests/input/b/x.json"]);
    expect(o.outDir).toBe("tests/expected");
  });

  it("is a suite only when an input directory has an expected one beside it", () => {
    expect(outputDirsOf(["test/d/input/a.json", "test/d/expected/.keep"]).find((o) => o.dir === "test/d")?.unaccepted).toEqual(["test/d/input/a.json"]);
    expect(outputDirsOf(["test/d/input/a.json", "test/d/notes/a.txt"]).length).toBe(0);
  });

  it("is a suite only beneath a directory of tests or test data, so a program's own input and output stay code", () => {
    expect(outputDirsOf(["src/io/input/a.ts", "src/io/output/a.ts"]).length).toBe(0);
    expect(outputDirsOf(["input/a.json", "expected/a.html"]).length).toBe(0);
    expect(dir(["src/test/resources/input/a.json", "src/test/resources/expected/a.json"], "src/test/resources")?.paired.size).toBe(1);
    expect(dir(["it-tests/input/a.json", "it-tests/output/a.json"], "it-tests")?.paired.size).toBe(1);
  });
});

describe("files found from their output", () => {
  it("leaves a golden file with two siblings of its stem unpaired, and pairs .expected as .golden", () => {
    const o = dir(["g/x.go", "g/x.input", "g/x.golden", "g/y.txt", "g/y.txt.expected"], "g")!;
    expect(o.unpaired).toEqual(["g/x.golden"]);
    expect(o.why).toBe("a golden file with more than one sibling of its stem");
    expect(o.paired.get("g/y.txt")).toEqual(["g/y.txt.expected"]);
  });

  it("reads UI outputs only under tests/…/ui", () => {
    expect(outputDirsOf(["src/ui/a.stderr"]).length).toBe(0);
    expect(dir(["tests/compile/ui/a.stderr", "tests/compile/ui/a.rs", "tests/compile/ui/b.stdout"], "tests/compile/ui")!.orphans).toEqual([{ output: "tests/compile/ui/b.stdout", names: "tests/compile/ui/b.rs" }]);
  });

  it("names syrupy's single-file directories, and leaves what names no test unpaired", () => {
    const o = dir(["t/test_a.py", "t/__snapshots__/test_a/x.raw", "t/__snapshots__/test_gone/x.raw", "t/__snapshots__/notes", "t/__snapshots__/plain.snap"], "t/__snapshots__")!;
    expect(o.paired.get("t/test_a.py")).toEqual(["t/__snapshots__/test_a/x.raw"]);
    expect(o.unpaired).toEqual(["t/__snapshots__/notes", "t/__snapshots__/plain.snap", "t/__snapshots__/test_gone/x.raw"]);
  });

  it("leaves an insta snapshot unpaired when its header is not read, or names no source", () => {
    expect(dir(["src/snapshots/crate__tests__name.snap"], "src/snapshots")!.why).toBe("an insta snapshot CSH did not read");
    expect(outputDirsOf(["src/snapshots/c__t__n.snap"], () => "no header\n").find((o) => o.dir === "src/snapshots")!.why).toBe("an insta snapshot with no source: in its header");
  });

  it("leaves an approved file with two siblings of its name unpaired, and ignores received files", () => {
    const o = dir(["j/T.java", "j/T.kt", "j/T.m.approved.txt", "j/U.java", "j/U.m.approved.txt", "j/U.m.received.txt"], "j")!;
    expect(o.unpaired).toEqual(["j/T.m.approved.txt"]);
    expect(o.why).toBe("an approved file with more than one sibling of its name");
    expect(o.paired.get("j/U.java")).toEqual(["j/U.m.approved.txt"]);
  });

  it("joins two reasons a directory leaves files unpaired", () => {
    expect(dir(["g/a.golden", "g/T.m.approved.txt"], "g")!.why).toBe("a golden file with no sibling it names, or an approved file with no sibling test of its name");
  });
});

describe("the adapter and the check", () => {
  it("makes one item per directory and every result from it", () => {
    const paths = ["baselines/reference/s/a.types", "baselines/reference/s/gone.types", "baselines/reference/s/t.types", "cases/s/a.ts", "cases/s/b.ts", "cases/s/t.ts", "cases/s/t.js", "g/a.golden"];
    const out = run({ source: { name: "Outputs", kind: "Outputs", at: "." }, vocabulary: { states: [], events: [] }, bindings: [], files: paths.map((path) => ({ path, digest: "", bytes: new Uint8Array(0) })) } as never);
    expect(out.items?.map((i) => i.id)).toEqual(["baselines/reference/s", "g"]);
    const gaps = outputGaps((out.items ?? []).map((i) => ({ ...i, source: "Outputs" })));
    expect(gaps.map((g) => `${g.kind} ${g.subject}`)).toEqual([
      "accepted-outputs Outputs/baselines/reference/s",
      "unaccepted-case Outputs/cases/s/b.ts",
      "orphan-output Outputs/baselines/reference/s/gone.types",
      "shared-stem Outputs/cases/s/t",
      "unpaired-outputs Outputs/g",
    ]);
    expect(gaps[0]!.detail).toBe("reference tree: 1 of 4 cases under cases/s has accepted outputs, 1 file under baselines/reference/s; the runner compares each case with them");
    expect(suiteFilesOf(outputDirsOf(paths))).toEqual([...paths].sort());
  });

  it("keeps a path with a space whole in a shared stem", () => {
    const paths = ["b/baselines/reference/s/my case.js", "b/cases/s/my case.ts", "b/cases/s/x/my case.ts"];
    const out = run({ source: { name: "Outputs", kind: "Outputs", at: "." }, vocabulary: { states: [], events: [] }, bindings: [], files: paths.map((path) => ({ path, digest: "", bytes: new Uint8Array(0) })) } as never);
    const shared = outputGaps((out.items ?? []).map((i) => ({ ...i, source: "Outputs" }))).find((g) => g.kind === "shared-stem")!;
    expect(shared.subject).toBe("Outputs/b/cases/s/my case");
    expect(shared.detail).toBe("b/cases/s/my case.ts, b/cases/s/x/my case.ts share the stem my case; which of them wrote b/baselines/reference/s/my case.js is not decided");
  });
});

describe("snapshot entries (stage 71, A-266)", () => {
  it("unescapes a key as the runner writes it, and reads no value as a key", () => {
    const snap = "// Jest Snapshot v1, https://goo.gl/fbAQLP\n\nexports[`a \\`b\\` \\${c} 1`] = `\nexports[\\`x 1\\`] = 1\n`;\n";
    expect(snapshotKeys(snap)).toEqual({ runner: "jest", keys: ["a `b` ${c} 1"] });
  });

  it("reads a file with neither first line both ways, Jest's and Vitest's", () => {
    const test = 'describe("d", () => { it("t", () => {}); });';
    expect(snapshotEntries("exports[`d t 1`] = `1`;\nexports[`d > t > hint 2`] = `2`;\nexports[`d t: hint 3`] = `3`;\n", test)).toEqual({ entries: 3, matched: 3, unmatched: [], unreadable: [] });
    expect(snapshotEntries("// Vitest Snapshot v1\n\nexports[`d t 1`] = `1`;\n", test).unmatched).toEqual(["d t 1"]);
  });

  it("names every test beneath an unreadable describe unreadable, by the describe's line", () => {
    const test = 'describe.each([[1]])("n %i", () => {\n  it("a", () => {});\n  it("b", () => {});\n});\nit(name, () => {});\nit("c", () => {});';
    expect(testNames(test)).toEqual({ names: [["c"]], unreadable: [1, 5] });
  });

  it("reads a template title with no placeholder, an escaped one, and an each title with no format, as literals", () => {
    expect(testNames("it(`a`, () => {});\nit(`\\${x}`, () => {});\nit.each([1])('b', () => {});").names).toEqual([["a"], ["${x}"], ["b"]]);
  });

  it("reads a title joined from strings as unreadable, and keeps a title's spaces as the runner does", () => {
    expect(testNames('it("adds " + "tax", () => {});\nit("  two  spaces ", () => {});')).toEqual({ names: [["  two  spaces "]], unreadable: [1] });
  });

  it("reads Jest's x and f aliases, so a skipped or focused test keeps its name", () => {
    expect(testNames('xdescribe("d", () => { xit("a", () => {}); fit("b", () => {}); });\nfdescribe("e", () => { xtest("c", () => {}); });').names).toEqual([["d", "a"], ["d", "b"], ["e", "c"]]);
  });

  it("reads the entries of a snapshot directory at the root of the checkout", () => {
    const enc = (t: string) => new TextEncoder().encode(t);
    const files = [{ path: "a.test.ts", digest: "", bytes: enc('it("a", () => {});') }, { path: "__snapshots__/a.test.ts.snap", digest: "", bytes: enc("exports[`a 1`] = `1`;\nexports[`gone 1`] = `2`;\n") }];
    const out = run({ source: { name: "Outputs", kind: "Outputs", at: "." }, vocabulary: { states: [], events: [] }, bindings: [], files } as never);
    expect(out.items?.[0]?.attrs?.entries).toBe("2");
    expect(JSON.parse(out.items?.[0]?.attrs?.obsolete ?? "{}").key).toBe("gone 1");
  });

  it("leaves a snapshot whose test file was read by name unread", () => {
    const paths = ["src/a.test.ts", "src/__snapshots__/a.test.ts.snap"];
    const files = [{ path: paths[0], digest: "", bytes: new Uint8Array(0) }, { path: paths[1], digest: "", bytes: new TextEncoder().encode("exports[`gone 1`] = `1`;\n") }];
    const out = run({ source: { name: "Outputs", kind: "Outputs", at: "." }, vocabulary: { states: [], events: [] }, bindings: [], files } as never);
    expect(out.items?.[0]?.attrs?.entries).toBeUndefined();
    expect(out.items?.[0]?.attrs?.obsolete).toBeUndefined();
  });
});

describe("outputs named after a test file (stage 71, A-267)", () => {
  it("reads a test file's stem less its affix, for the files the proposal reads as tests", () => {
    expect(["a_test.go", "a.test.ts", "a.spec.tsx", "test_a.py", "a_test.py", "ATest.java", "ATests.java"].map(testStemOf)).toEqual(["a", "a", "a", "a", "a", "A", "A"]);
    expect(["a.go", "contest.ts", "Test.java", "TestA.java", "test.py", "a_test.txt", "a-test.js", "a_spec.rb"].map(testStemOf)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  it("never takes an accepted output for a test file, even with a test's affix", () => {
    const o = dir(["base/baselines/reference/a.test.ts"], "base/baselines/reference")!;
    expect(o.paired.size).toBe(0);
    expect(o.unpaired).toEqual(["base/baselines/reference/a.test.ts"]);
  });

  it("pairs an output only where the conventions of section 2 left it unpaired, and leaves a stem two test files share unpaired", () => {
    const os = outputDirsOf(["base/baselines/reference/fs/a.baseline", "base/baselines/reference/fs/b.txt", "x/a_test.go", "x/b_test.go", "y/b.test.ts"]);
    const o = os.find((d) => d.dir === "base/baselines/reference/fs")!;
    expect(o.conventions).toEqual(["named after a test file"]);
    expect([...o.paired]).toEqual([["x/a_test.go", ["base/baselines/reference/fs/a.baseline"]]]);
    expect(o.unpaired).toEqual(["base/baselines/reference/fs/b.txt"]);
    expect(o.why).toBe("a stem two test files share");
    expect(o.named).toEqual(["x/b_test.go", "y/b.test.ts"]);
    expect(suiteFilesOf(os)).toContain("y/b.test.ts");
  });

  it("keeps a test file's outputs in the suite its directory's tests write, when its stem names another suite's too", () => {
    const os = outputDirsOf(["t/baselines/reference/fs/a.baseline", "t/baselines/reference/fs/b.baseline", "t/baselines/reference/tsc/a.js", "x/a_test.go", "x/b_test.go"]);
    expect([...os.find((d) => d.dir === "t/baselines/reference/fs")!.paired.keys()]).toEqual(["x/a_test.go", "x/b_test.go"]);
    const tsc = os.find((d) => d.dir === "t/baselines/reference/tsc")!;
    expect(tsc.paired.size).toBe(0);
    expect(tsc.unpaired).toEqual(["t/baselines/reference/tsc/a.js"]);
    expect(tsc.why).toBe("a stem of a test file whose directory's tests write another suite");
  });
});

describe("snapshot entries and outputs named after a test, beyond TypeScript (stage 74, A-269)", () => {
  const texts = (m: Record<string, string>) => (p: string) => m[p];

  it("reads syrupy's names, less their parameters and counters, and a module's tests by class", () => {
    expect(syrupyKeys("# serializer version: 1\n# name: TestC.test_x[a-b]\n  1\n# ---\n# name: test_y.1\n  2\n# ---\n")).toEqual(["TestC.test_x[a-b]", "test_y.1"]);
    expect(["TestC.test_x[a-b]", "test_y.1", "test_z[p].2", "test_w"].map(syrupyName)).toEqual(["TestC.test_x", "test_y", "test_z", "test_w"]);
    const names = pythonTestNames("def test_a():\n    pass\nclass TestB:\n    def test_c(self):\n        def test_inner(): pass\n    class TestD:\n        async def test_e(self): pass\ndef helper(): pass\ndef test_f(): pass\n");
    expect([...names].sort()).toEqual(["TestB.TestD.test_e", "TestB.test_c", "test_a", "test_f"]);
    // pytest collects no method of a class whose name does not begin Test.
    expect([...pythonTestNames("class Helper:\n    def test_x(self): pass\nclass TestK:\n    class Inner:\n        def test_y(self): pass\n")]).toEqual([]);
  });

  it("reads an insta header's source and a snapshot's name", () => {
    expect(instaSource("---\nsource: src/lib.rs\nexpression: x\n---\nbody\n")).toBe("src/lib.rs");
    expect(instaSource("---\r\nsource: tests/a.rs \r\n---\r\n")).toBe("tests/a.rs");
    expect(instaSource("body\n")).toBeUndefined();
    expect(["s/c__tests__render.snap", "s/c__m__shown-2.snap", "s/plain.snap", "s/m__tests__render@input.txt.snap", "s/m__tests__render@a__b-3.snap"].map(instaName)).toEqual(["render", "shown", "plain", "render", "render"]);
  });

  it("reads a Rust file's snapshot names, and says where a name is not a literal", () => {
    const r = rustSnapshotNames('fn test_a() { insta::assert_snapshot!(x); }\nfn b() {\n  insta::assert_debug_snapshot!("named", f(1, 2));\n  insta::assert_snapshot!(format!("n{}", i), y);\n}\n');
    expect([...r.names].sort()).toEqual(["a", "b", "named", "test_a"]);
    expect(r.unreadable).toEqual([4]);
  });

  it("reads a Java method by its class, and a Go file's test functions", () => {
    const j = "class ReceiptTest {\n  @Test\n  void printsTotal() throws IOException {\n  }\n  private String helper(int a) { return \"\"; }\n}\n";
    expect(javaDeclares(j, "ReceiptTest", "printsTotal")).toBe(true);
    expect(javaDeclares(j, "ReceiptTest", "helper")).toBe(true);
    expect(javaDeclares(j, "ReceiptTest", "printsTax")).toBe(false);
    expect(javaDeclares(j, "OtherTest", "printsTotal")).toBe(false);
    // The method must be the named class's, and a parameter's annotation may hold parentheses.
    expect(javaDeclares("class ReceiptTest {\n  void other() {}\n}\nclass Helper {\n  void printsTotal() {}\n}\n", "ReceiptTest", "printsTotal")).toBe(false);
    expect(javaDeclares('class ReceiptTest {\n  void printsTotal(@ForAll("prices") int p) {\n  }\n}\n', "ReceiptTest", "printsTotal")).toBe(true);
    expect([...goTestFunctions("func TestA(t *testing.T) {}\nfunc helper() {}\nfunc TestB_c(t *testing.T) {}\n")]).toEqual(["TestA", "TestB_c"]);
    expect(["d/TestPage.golden", "d/header.golden", "d/completionsBasic1.baseline.jsonc", "d/Testify.golden"].map(testFunctionOf)).toEqual(["TestPage", "TestHeader", "TestCompletionsBasic1", "TestTestify"]);
  });

  it("pairs a lone golden file with its package's test function, and finds an obsolete one only where every test file was read", () => {
    const paths = ["p/p_test.go", "p/q_test.go", "p/testdata/TestA.golden", "p/testdata/b.golden", "p/testdata/TestGone.golden"];
    const read = texts({ "p/p_test.go": "func TestA(t *testing.T) {}\n", "p/q_test.go": "func TestB(t *testing.T) {}\n" });
    const o = outputDirsOf(paths, read).find((d) => d.dir === "p/testdata")!;
    expect([...o.paired]).toEqual([["p/p_test.go", ["p/testdata/TestA.golden"]], ["p/q_test.go", ["p/testdata/b.golden"]]]);
    expect(o.unpaired).toEqual([]);
    expect(o.why).toBeUndefined();
    expect(o.entries?.find((e) => e.snapshot === "p/testdata/TestGone.golden")).toEqual({ snapshot: "p/testdata/TestGone.golden", test: "p/p_test.go, p/q_test.go", entries: 1, matched: 0, unmatched: ["TestGone"], unreadable: [] });
    expect(o.opened).toEqual(["p/p_test.go", "p/q_test.go"]);
    expect(suiteFilesOf([o])).toContain("p/testdata/TestGone.golden");
    // One test file the source could not read: the golden file stays unpaired, never obsolete.
    const half = outputDirsOf(paths, texts({ "p/p_test.go": "func TestA(t *testing.T) {}\n" })).find((d) => d.dir === "p/testdata")!;
    expect(half.unpaired).toEqual(["p/testdata/TestGone.golden", "p/testdata/b.golden"]);
    expect(half.entries?.some((e) => e.matched === 0)).toBe(false);
  });

  it("leaves a lone golden file undecided where a test names it, or builds golden paths as CSH cannot read", () => {
    const paths = ["p/p_test.go", "p/testdata/header-v2.golden"];
    const table = 'func TestHeader(t *testing.T) {\n\tfor _, c := range cases {\n\t\tgolden := filepath.Join("testdata", c.name+".golden")\n\t\t_ = golden\n\t}\n}\n';
    const o = outputDirsOf(paths, texts({ "p/p_test.go": table })).find((d) => d.dir === "p/testdata")!;
    expect(o.entries).toEqual([{ snapshot: "p/testdata/header-v2.golden", test: "p/p_test.go", entries: 1, matched: 0, unmatched: ["TestHeader-v2"], unreadable: [3] }]);
    const named = outputDirsOf(paths, texts({ "p/p_test.go": 'func TestX(t *testing.T) {\n\tread("header-v2.golden")\n}\n' })).find((d) => d.dir === "p/testdata")!;
    expect(named.entries?.[0]?.unreadable).toEqual([2]);
  });

  it("never pairs a golden file with two siblings of its stem by a test function elsewhere", () => {
    const paths = ["d/page.html", "d/page.txt", "d/page.golden", "e/e_test.go"];
    const os = outputDirsOf(paths, texts({ "e/e_test.go": "func TestPage(t *testing.T) {}\n" }));
    expect(os.find((d) => d.dir === "d")!.unpaired).toEqual(["d/page.golden"]);
    expect(os.some((d) => d.conventions.includes("named after a test function"))).toBe(false);
  });

  it("pairs an output no test file names with the one Go test function its stem names, anywhere", () => {
    const paths = ["t/baselines/reference/fs/c/caseOne.baseline", "t/baselines/reference/fs/c/caseTwo.baseline", "t/baselines/reference/fs/c/shared.baseline", "g/gen_test.go", "h/other_test.go", "x/shared_test.go"];
    const read = texts({ "g/gen_test.go": "func TestCaseOne(t *testing.T) {}\nfunc TestCaseTwo(t *testing.T) {}\n", "h/other_test.go": "func TestCaseTwo(t *testing.T) {}\n", "x/shared_test.go": "func TestShared(t *testing.T) {}\n" });
    const o = outputDirsOf(paths, read).find((d) => d.dir === "t/baselines/reference/fs")!;
    // caseTwo is declared twice, and shared is named by a test file's stem already: neither is paired by function.
    expect(o.paired.get("g/gen_test.go")).toEqual(["t/baselines/reference/fs/c/caseOne.baseline"]);
    expect(o.unpaired).toEqual(["t/baselines/reference/fs/c/caseTwo.baseline"]);
    expect(o.conventions).toEqual(["named after a test file", "named after a test function"]);
    // Only the files declaring a function an output names are read whole, not every Go test of the checkout.
    expect(o.opened).toEqual(["g/gen_test.go", "h/other_test.go"]);
    // Without the text, the pairing is stage 71's.
    expect(outputDirsOf(paths).find((d) => d.dir === "t/baselines/reference/fs")!.conventions).toEqual(["named after a test file"]);
  });

  it("takes a numbered or parameterised output for the most specific test function a file declares (stage 73)", () => {
    expect(testFunctionsOf("d/amb.1.callHierarchy.txt")).toEqual(["TestAmb1", "TestAmb"]);
    expect(testFunctionsOf("d/showAll=false.baseline.jsonc")).toEqual(["TestShowAll=false", "TestShowAll"]);
    const paths = ["t/baselines/reference/fs/c/amb.1.txt", "t/baselines/reference/fs/c/amb.2.txt", "t/baselines/reference/fs/c/lens=true.jsonc", "t/baselines/reference/fs/c/table.baseline", "g/a_test.go", "g/b_test.go"];
    const read = texts({ "g/a_test.go": "func TestAmb1(t *testing.T) {}\nfunc TestAmb(t *testing.T) {}\n", "g/b_test.go": "func TestAmb2(t *testing.T) {}\nfunc TestLens(t *testing.T) {}\nfunc TestTables(t *testing.T) {}\n" });
    const o = outputDirsOf(paths, read).find((d) => d.dir === "t/baselines/reference/fs")!;
    expect(o.paired.get("g/a_test.go")).toEqual(["t/baselines/reference/fs/c/amb.1.txt"]);
    expect(o.paired.get("g/b_test.go")).toEqual(["t/baselines/reference/fs/c/amb.2.txt", "t/baselines/reference/fs/c/lens=true.jsonc"]);
    expect(o.unpaired).toEqual(["t/baselines/reference/fs/c/table.baseline"]);
    // A lone golden file in a package is read the same way: TestA.1 is TestA1's, and x=v is TestX's, never obsolete.
    const pkg = ["p/a_test.go", "p/b_test.go", "p/testdata/TestA.1.golden", "p/testdata/x=v.golden"];
    const q = outputDirsOf(pkg, texts({ "p/a_test.go": "func TestA(t *testing.T) {}\n", "p/b_test.go": "func TestA1(t *testing.T) {}\nfunc TestX(t *testing.T) {}\n" })).find((d) => d.dir === "p/testdata")!;
    expect([...q.paired]).toEqual([["p/b_test.go", ["p/testdata/TestA.1.golden", "p/testdata/x=v.golden"]]]);
    expect(q.entries?.every((e) => e.matched === 1)).toBe(true);
  });

  it("pairs an insta snapshot with the source its header names, from the crate's root, and keeps that source code", () => {
    const paths = ["crates/a/Cargo.toml", "crates/a/src/lib.rs", "crates/a/src/snapshots/a__tests__one.snap", "crates/a/tests/snapshots/it__two.snap"];
    const read = texts({ "crates/a/src/snapshots/a__tests__one.snap": "---\nsource: src/lib.rs\n---\n1\n", "crates/a/tests/snapshots/it__two.snap": "---\nsource: tests/it.rs\n---\n2\n", "crates/a/src/lib.rs": "fn test_one() {}\n" });
    const os = outputDirsOf(paths, read);
    const o = os.find((d) => d.dir === "crates/a/src/snapshots")!;
    expect([...o.paired]).toEqual([["crates/a/src/lib.rs", ["crates/a/src/snapshots/a__tests__one.snap"]]]);
    expect(o.code).toEqual(["crates/a/src/lib.rs"]);
    expect(o.entries).toEqual([{ snapshot: "crates/a/src/snapshots/a__tests__one.snap", test: "crates/a/src/lib.rs", entries: 1, matched: 1, unmatched: [], unreadable: [] }]);
    expect(os.find((d) => d.dir === "crates/a/tests/snapshots")!.orphans).toEqual([{ output: "crates/a/tests/snapshots/it__two.snap", names: "crates/a/tests/it.rs" }]);
    // The source reads the crate's manifest by name, so given only the suite's files the adapter finds the same root.
    expect(o.named).toEqual(["crates/a/Cargo.toml"]);
    const again = outputDirsOf(suiteFilesOf(os), read);
    expect(again.find((d) => d.dir === "crates/a/tests/snapshots")!.orphans).toEqual([{ output: "crates/a/tests/snapshots/it__two.snap", names: "crates/a/tests/it.rs" }]);
  });

  it("turns an unmatched entry into an obsolete snapshot, or an undecided one beside a name CSH cannot read", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const files = [
      { path: "src/lib.rs", bytes: enc('fn kept() { insta::assert_snapshot!(name_of(1), v); }\n') },
      { path: "src/snapshots/c__tests__kept.snap", bytes: enc("---\nsource: src/lib.rs\n---\n1\n") },
      { path: "src/snapshots/c__tests__gone.snap", bytes: enc("---\nsource: src/lib.rs\n---\n2\n") },
      { path: "j/T.java", bytes: enc("class T { void m() {} }\n") },
      { path: "j/T.gone.approved.txt", bytes: enc("x") },
    ];
    const gaps = outputGaps((run({ files } as never).items ?? []).map((i) => ({ ...i, source: "Outputs" })));
    expect(gaps.map((g) => `${g.kind} ${g.subject}`).sort()).toEqual(["accepted-outputs Outputs/j", "accepted-outputs Outputs/src/snapshots", "obsolete-snapshot Outputs/j/T.gone.approved.txt::gone", "snapshot-undecided Outputs/src/snapshots/c__tests__gone.snap"]);
    expect(gaps.find((g) => g.kind === "obsolete-snapshot")!.detail).toBe("gone: no test of j/T.java has this name, and CSH read every test it could be; the file stays and no test reads it");
  });
});
