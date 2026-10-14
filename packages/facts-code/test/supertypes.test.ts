// Supertypes (stage 59): the interfaces a Java type implements or extends, a Rust trait's supertraits and what a Go
// struct or interface embeds, written as a declaration's `bases` beside its `base`.
import { describe, expect, it } from "vitest";
import type { AdapterInput, Fact } from "@csh/witness";
import { run } from "../src/index.ts";

const input = (files: Record<string, string>): AdapterInput => ({
  source: { name: "Code", kind: "Code", at: "." },
  vocabulary: { units: [], enums: [], states: [], events: [] },
  bindings: [],
  files: Object.entries(files).map(([path, text]) => ({ path, digest: "", bytes: new TextEncoder().encode(text) })),
  config: { commit: "c1" },
});
const supers = async (files: Record<string, string>) =>
  ((await run(input(files))).facts ?? []).flatMap((f: Fact) => (f.kind === "declare" && f.declares !== "const" && f.declares !== "function" && f.declares !== "method" ? [[f.symbol, f.base ?? null, f.bases ?? null]] : []));

describe("supertypes", () => {
  it("reads what a Java class implements and what an interface extends after its first", async () => {
    expect(await supers({ "A.java": "package p;\nclass A extends B implements C, D<E> {}\n", "I.java": "package p;\ninterface I extends J, K<L> {}\n", "R.java": "package p;\nrecord R(int x) implements C {}\n" })).toEqual([
      ["A", "B", ["C", "D"]],
      ["I", "J", ["K"]],
      ["R", null, ["C"]],
    ]);
  });

  it("reads every supertrait of a Rust trait, leaving ?Sized and lifetimes out", async () => {
    expect(await supers({ "Cargo.toml": '[package]\nname = "a"\n', "src/lib.rs": "pub trait S: R + W<T> + ?Sized {}\npub trait L: 'static + R {}\npub trait R {}\npub trait W<T> {}\n" })).toEqual([
      ["S", "R", ["W"]],
      ["L", "R", null],
      ["R", null, null],
      ["W", null, null],
    ]);
  });

  it("reads what a Go struct or interface embeds", async () => {
    expect(await supers({ "go.mod": "module a\n", "a.go": "package a\n\ntype A struct {\n\t*M\n\tsync.Mutex\n\tx int\n}\n\ntype I interface {\n\tJ\n\tDo()\n}\n\ntype M struct{}\n" })).toEqual([
      ["A", null, ["M", "sync.Mutex"]],
      ["I", null, ["J"]],
      ["M", null, null],
    ]);
  });
});
