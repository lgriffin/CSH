// Accepted outputs paired by path (Reading test suites as evidence, section 2; A-263): the edges of each convention
// that the fixtures F210 to F216 do not reach.
import { describe, expect, it } from "vitest";
import { outputDirsOf, run, suiteFilesOf } from "../src/outputs.ts";
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
  it("pairs only at the same path below each root, and reads a pair at the root of the checkout", () => {
    const o = dir(["input/a/x.json", "input/b/x.json", "expected/a/x.html"], ".")!;
    expect([...o.paired.keys()]).toEqual(["input/a/x.json"]);
    expect(o.unaccepted).toEqual(["input/b/x.json"]);
    expect(o.outDir).toBe("expected");
  });

  it("is a suite only when an input directory has an expected one beside it", () => {
    expect(outputDirsOf(["d/input/a.json", "d/expected/.keep"]).find((o) => o.dir === "d")?.unaccepted).toEqual(["d/input/a.json"]);
    expect(outputDirsOf(["d/input/a.json", "d/notes/a.txt"]).length).toBe(0);
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
    expect(dir(["src/snapshots/crate__tests__name.snap"], "src/snapshots")!.why).toBe("an insta snapshot, named by its header (stage 71)");
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
});
