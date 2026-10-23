import { describe, expect, it } from "vitest";
import { herebyTasks, justRecipes, makeTargets, runnerOf, taskFacts, type FactContext } from "../src/index.ts";

const ctx: FactContext = { commit: "c", base: (tool) => ({ schema: "csh-facts/v2", subject: { commit: "c" }, tool }) };
const file = (path: string, text: string) => ({ path, digest: "", bytes: new TextEncoder().encode(text) });

describe("task runners (stage 68)", () => {
  it("knows a runner's file only at the root", () => {
    expect(["Herebyfile.mjs", "Herebyfile.ts", "Makefile", "GNUmakefile", "justfile", ".justfile"].map(runnerOf)).toEqual(["hereby", "hereby", "make", "make", "just", "just"]);
    expect(["tools/Makefile", "herebyfile.mjs", "Makefile.am", "justfile.bak"].map(runnerOf)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("reads hereby's literal task names, and opens the set for any other name", () => {
    expect(herebyTasks('task({ name: "build", run }); task({\n  name: \'test\',\n}); task({ name: `lint` });')).toEqual(["build", "test", "lint"]);
    expect(herebyTasks('task({ name: "a", displayName: "y", "name-ish": 1 }); a.name = "z";')).toEqual(["a"]);
    expect(herebyTasks('const x = { name: "not a task" };')).toEqual(["*"]);
    expect(herebyTasks("function t(name) { return task({ name, run }); }")).toEqual(["*"]);
    expect(herebyTasks('task({ name: prefix + ":x" }); task({ name: "ok" });')).toEqual(["ok", "*"]);
    expect(herebyTasks("task({ name: `gen:${x}` });")).toEqual(["*"]);
  });

  it("reads only the whole literal of a hereby task's name, decodes its escapes, and skips comments", () => {
    expect(herebyTasks('task({ name: "build" + suffix });')).toEqual(["*"]);
    expect(herebyTasks('task({ name: "a\\"b", run }); task({ name: \'it\\\'s\' }); task({ name: "\\u0063i" });')).toEqual(['a"b', "it's", "ci"]);
    expect(herebyTasks('// task({ name })\n/* name, */ task({ name: "x", description: "the name, given" });')).toEqual(["x"]);
    expect(herebyTasks('const options = { name };\ntask({ name: "x", run: () => f({ name: other }) });')).toEqual(["x", "*"]);
    expect(herebyTasks('task({ name: "x", description: "a ) in a string" });\ntask({ name: "y" });')).toEqual(["x", "y"]);
  });

  it("reads make's targets, never a special target, an assignment or a recipe line", () => {
    const text = ".PHONY: build lint\n\nbuild: dep\n\tlint: not a target\nlint check:: build\nVERSION := 1\nX ::= 2\nY = a:b\n# c: comment\nout/app.js: src/a.js\n";
    expect(makeTargets(text)).toEqual(["build", "lint", "check", "out/app.js"]);
    expect(makeTargets("include common.mk\nbuild:\n")).toEqual(["build", "*"]);
    expect(makeTargets("%.o: %.c\n")).toEqual(["*"]);
    expect(makeTargets("$(BIN): main.c\n")).toEqual(["*"]);
  });

  it("reads just's recipes and aliases, never a setting or an assignment", () => {
    const text = 'set shell := ["bash", "-c"]\nversion := "1"\nalias d := deploy\n\nfmt:\n    echo fmt\n@quiet:\n    echo\ndeploy env="staging" target=\'x\': fmt\n    echo {{env}}\n';
    expect(justRecipes(text)).toEqual(["d", "fmt", "quiet", "deploy"]);
    expect(justRecipes("import 'other.just'\nfmt:\n")).toEqual(["fmt", "*"]);
    expect(justRecipes("mod tools\n")).toEqual(["*"]);
    expect(justRecipes("mod? tools\nimport? 'x.just'\n")).toEqual(["*"]);
    expect(justRecipes("import-data:\n    ./load\nmod:\n    echo\nset-up:\n    echo\n[private]\nclean:\n[no-cd, private] lint:\n")).toEqual(["import-data", "mod", "set-up", "clean", "lint"]);
  });

  it("writes one task fact per name of each runner file at the root", () => {
    const facts = taskFacts([file("Makefile", "a:\nb: a\na:\n"), file("tools/Makefile", "c:\n"), file("src/x.ts", "")], ctx);
    expect(facts.map((f) => (f.kind === "task" ? [f.runner, f.file, f.name] : []))).toEqual([
      ["make", "Makefile", "a"],
      ["make", "Makefile", "b"],
    ]);
  });
});
