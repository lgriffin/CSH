// Accepted outputs paired by path (Reading test suites as evidence, section 2; A-263): the edges of each convention
// that the fixtures F210 to F216 do not reach.
import { describe, expect, it } from "vitest";
import { outputDirsOf, run, snapshotEntries, snapshotKeys, suiteFilesOf, testStemOf } from "../src/outputs.ts";
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

  it("leaves an insta snapshot unpaired until its header is read", () => {
    expect(dir(["src/snapshots/crate__tests__name.snap"], "src/snapshots")!.why).toBe("an insta snapshot, named by its header (stage 74)");
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

  it("reads a template title with no placeholder, and an each title with no format, as literals", () => {
    expect(testNames("it(`a`, () => {});\nit.each([1])('b', () => {});").names).toEqual([["a"], ["b"]]);
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
  it("reads a test file's stem less its affix in each language", () => {
    expect(["a_test.go", "a.test.ts", "a.spec.tsx", "a-test.js", "test_a.py", "ATest.java", "ATests.cs", "TestA.java", "a_spec.rb"].map(testStemOf)).toEqual(["a", "a", "a", "a", "a", "A", "A", "A", "a"]);
    expect(["a.go", "contest.ts", "Test.java", "test.py", "a_test.txt"].map(testStemOf)).toEqual([undefined, undefined, undefined, undefined, undefined]);
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
