// The Rust reader (stage 34): modules, the module tree that `mod` declarations build, `use` paths resolved against it
// and across a cargo workspace, declarations, exports and Cargo.toml fields.
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
const read = async (files: Record<string, string>) => {
  const out = await run(input(files));
  return { facts: out.facts ?? [], diagnostics: out.diagnostics };
};
const deps = (facts: Fact[], from?: string) => facts.flatMap((f) => (f.kind === "depends" && (from === undefined || f.from === from) ? [`${f.at} -> ${f.to}`] : []));
const skipped = (facts: Fact[]) => facts.flatMap((f) => (f.kind === "skipped" ? [`${f.at} ${f.reason}`] : []));
const declares = (facts: Fact[], module: string) => facts.flatMap((f) => (f.kind === "declare" && f.module === module ? [[f.symbol, f.declares, f.base ?? null, f.value ?? null]] : []));
const exportsOf = (facts: Fact[], module: string) => facts.flatMap((f) => (f.kind === "export" && f.module === module ? [f.from !== undefined ? `${f.symbol} from ${f.from}` : f.symbol] : []));

/** A cargo workspace of two crates: a core with mod.rs and 2018 layouts, and adapters that use it. */
const WORKSPACE: Record<string, string> = {
  "Cargo.toml": '[workspace]\nmembers = ["core", "adapters"]\n',
  "core/Cargo.toml": '[package]\nname = "hex-core"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nserde = "1"\n\n[profile.release]\nlto = true\n',
  "core/src/lib.rs": [
    "//! The core.",
    "pub mod domain;",
    "mod util;",
    '#[path = "special/odd.rs"]',
    "pub mod odd;",
    "mod missing;",
    "pub use domain::model::Order;",
    "pub use self::util::*;",
    "pub use util::clamp as limit;",
    "pub const LIMIT: u32 = 1_000u32;",
    'pub static NAME: &str = "core\\n";',
    "pub(crate) fn helper() {}",
    "pub trait Repository: Send + Sync {}",
    "#[macro_export]",
    "macro_rules! m { () => {} }",
    "#[cfg(test)]",
    "mod tests {",
    "    use super::*;",
    "    use crate::domain::model::Order;",
    "}",
    "",
  ].join("\n"),
  "core/src/domain/mod.rs": "pub mod model;\nuse crate::util::clamp;\nuse std::collections::HashMap;\nuse serde::Serialize;\nuse core::fmt;\n",
  "core/src/domain/model.rs": [
    "use super::super::util;",
    "use crate::domain::{self, model::Order as O};",
    "pub struct Order;",
    "pub enum Status { Open }",
    "pub trait Entity: std::fmt::Debug + Clone {}",
    "const RATIO: f64 = 2.5e3_f64;",
    "const NEG: i64 = -0x1F;",
    "const ON: bool = true;",
    "type Id = u64;",
    "union U { a: u8 }",
    "impl Entity for Order {}",
    "use crate::nowhere::X;",
    "use super::super::super::Y;",
    "",
  ].join("\n"),
  "core/src/util.rs": "pub mod fmt;\npub fn clamp() {}\n",
  "core/src/util/fmt.rs": "use super::clamp;\nuse self::inner::Y;\nmod inner { pub struct Y; }\n",
  "core/src/special/odd.rs": "pub fn odd() {}\n",
  "adapters/Cargo.toml": '[package]\nname = "hex-adapters"\nversion = "0.1.0"\n\n[dependencies]\nhex-core = { path = "../core" }\ntokio = "1"\n',
  "adapters/src/lib.rs": "extern crate tokio;\nuse hex_core::domain::model::Order;\nuse hex_core::{Repository, LIMIT};\nuse ::std::io;\npub mod db;\nuse db::Pool;\n",
  "adapters/src/db.rs": "use super::*;\npub struct Pool;\nimpl Pool {\n    fn get(&self) { use std::sync::Arc; }\n}\n",
  "adapters/src/main.rs": "use hex_adapters::db::Pool;\nfn main() {}\n",
};

describe("the module tree and use paths", () => {
  it("resolves mod declarations, use trees, self, super, std, external and cross-crate paths", async () => {
    const { facts, diagnostics } = await read(WORKSPACE);
    expect(diagnostics).toEqual([]);
    expect(deps(facts)).toEqual([
      // `use super::*` in a child module names its parent; a `use` inside a fn body still counts.
      "adapters/src/db.rs:1 -> adapters/src/lib.rs",
      "adapters/src/db.rs:4 -> rust:std",
      // extern crate, a path into another workspace crate (its module, or its root for a root item), `::std`.
      "adapters/src/lib.rs:1 -> tokio",
      "adapters/src/lib.rs:2 -> core/src/domain/model.rs",
      "adapters/src/lib.rs:3 -> core/src/lib.rs",
      "adapters/src/lib.rs:4 -> rust:std",
      "adapters/src/lib.rs:5 -> adapters/src/db.rs",
      // A 2018 path starting with a child module of the current one.
      "adapters/src/lib.rs:6 -> adapters/src/db.rs",
      // A binary names its own package's library by crate name, `-` read as `_`.
      "adapters/src/main.rs:1 -> adapters/src/db.rs",
      "core/src/domain/mod.rs:1 -> core/src/domain/model.rs",
      "core/src/domain/mod.rs:2 -> core/src/util.rs",
      "core/src/domain/mod.rs:3 -> rust:std",
      "core/src/domain/mod.rs:4 -> serde",
      "core/src/domain/mod.rs:5 -> rust:core",
      "core/src/domain/model.rs:1 -> core/src/util.rs",
      // `{self, model::Order}`: `self` is domain itself; model::Order is this file, so no fact.
      "core/src/domain/model.rs:2 -> core/src/domain/mod.rs",
      "core/src/lib.rs:2 -> core/src/domain/mod.rs",
      "core/src/lib.rs:3 -> core/src/util.rs",
      "core/src/lib.rs:5 -> core/src/special/odd.rs",
      "core/src/lib.rs:7 -> core/src/domain/model.rs",
      "core/src/lib.rs:8 -> core/src/util.rs",
      "core/src/lib.rs:9 -> core/src/util.rs",
      // Inside `#[cfg(test)] mod tests`, `super::*` is the root itself (no fact) and `crate::` paths resolve as anywhere.
      "core/src/lib.rs:19 -> core/src/domain/model.rs",
      // The 2018 layout: util.rs's children live in util/.
      "core/src/util.rs:1 -> core/src/util/fmt.rs",
      "core/src/util/fmt.rs:1 -> core/src/util.rs",
    ]);
    // lib.rs globs util.rs, which declares no `nowhere`, so the glob does not hide the unresolved path.
    expect(skipped(facts)).toEqual([
      "core/src/domain/model.rs:12 unresolved crate::nowhere::X",
      "core/src/domain/model.rs:13 unresolved super::super::super::Y",
      "core/src/lib.rs:6 unresolved mod missing",
    ]);
    expect(facts.every((f) => f.kind !== "depends" || f.typeOnly === false)).toBe(true);
  });

  it("writes one module per file, in Rust, from facts-rust", async () => {
    const { facts } = await read(WORKSPACE);
    const modules = facts.filter((f) => f.kind === "module");
    expect(modules.map((f) => (f.kind === "module" ? [f.name, f.language] : []))).toEqual(
      ["adapters/src/db.rs", "adapters/src/lib.rs", "adapters/src/main.rs", "core/src/domain/mod.rs", "core/src/domain/model.rs", "core/src/lib.rs", "core/src/special/odd.rs", "core/src/util.rs", "core/src/util/fmt.rs"].map((p) => [p, "rust"]),
    );
    expect(facts.every((f) => f.tool.id === "facts-rust" && f.tool.version === "0.1.0" && f.subject.commit === "c1")).toBe(true);
  });

  it("reads the Cargo.toml tables that say what a crate is, and no others", async () => {
    const { facts } = await read(WORKSPACE);
    expect(facts.flatMap((f) => (f.kind === "field" ? [`${f.file} ${f.path} ${f.value}`] : []))).toEqual([
      "Cargo.toml /workspace/members/0 core",
      "Cargo.toml /workspace/members/1 adapters",
      "adapters/Cargo.toml /package/name hex-adapters",
      "adapters/Cargo.toml /package/version 0.1.0",
      "adapters/Cargo.toml /dependencies/hex-core/path ../core",
      "adapters/Cargo.toml /dependencies/tokio 1",
      "core/Cargo.toml /package/name hex-core",
      "core/Cargo.toml /package/version 0.1.0",
      "core/Cargo.toml /package/edition 2021",
      "core/Cargo.toml /dependencies/serde 1",
    ]);
  });

  it("is the same whatever order the files come in", async () => {
    const a = await read(WORKSPACE);
    const b = await read(Object.fromEntries(Object.entries(WORKSPACE).reverse()));
    expect(b).toEqual(a);
  });

  it("reads a file no mod declaration reaches: crate paths resolve, self and super cannot", async () => {
    const { facts } = await read({ ...WORKSPACE, "core/src/orphan.rs": "use crate::util::clamp;\nuse self::x::Y;\nuse super::Z;\n" });
    expect(deps(facts, "core/src/orphan.rs")).toEqual(["core/src/orphan.rs:1 -> core/src/util.rs"]);
    expect(skipped(facts).filter((s) => s.startsWith("core/src/orphan.rs"))).toEqual(["core/src/orphan.rs:2 unresolved self::x::Y", "core/src/orphan.rs:3 unresolved super::Z"]);
  });

  it("takes a crate's library and binaries from [lib] and [[bin]], and its name from [lib] name", async () => {
    const { facts } = await read({
      "x/Cargo.toml": '[package]\nname = "x-y"\n[lib]\nname = "xy"\npath = "lib/root.rs"\n[[bin]]\nname = "tool"\npath = "tools/tool.rs"\n',
      "x/lib/root.rs": "pub mod inner;\n",
      "x/lib/inner.rs": "pub fn f() {}\n",
      "x/tools/tool.rs": "mod cli;\nuse xy::inner::f;\nuse crate::cli::run;\n",
      "x/tools/cli.rs": "pub fn run() {}\n",
      "x/tests/it.rs": "use xy::inner;\n",
    });
    expect(deps(facts)).toEqual([
      "x/lib/root.rs:1 -> x/lib/inner.rs",
      "x/tests/it.rs:1 -> x/lib/inner.rs",
      "x/tools/tool.rs:1 -> x/tools/cli.rs",
      "x/tools/tool.rs:2 -> x/lib/inner.rs",
      "x/tools/tool.rs:3 -> x/tools/cli.rs",
    ]);
    expect(skipped(facts)).toEqual([]);
  });

  it("treats the repository root as one crate when no Cargo.toml declares a package, and writes one fact per line and target", async () => {
    const { facts } = await read({
      "src/lib.rs": "mod a;\nuse crate::a::{B, C};\nuse crate::c::D;\n",
      "src/a.rs": "pub struct B;\npub struct C;\n",
    });
    expect(deps(facts)).toEqual(["src/lib.rs:1 -> src/a.rs", "src/lib.rs:2 -> src/a.rs"]);
    expect(skipped(facts)).toEqual(["src/lib.rs:3 unresolved crate::c::D"]);
  });

  it("reports a malformed Cargo.toml and still reads the code", async () => {
    const { facts, diagnostics } = await read({ "Cargo.toml": "[package\nname = 1\n", "src/main.rs": "mod a;\nfn main() {}\n", "src/a.rs": "" });
    expect(diagnostics.map((d) => [d.code, d.span])).toEqual([["malformed-manifest", "Cargo.toml"]]);
    expect(deps(facts)).toEqual(["src/main.rs:1 -> src/a.rs"]);
  });
});

describe("declarations and exports", () => {
  it("declares top-level items with a trait's first supertrait and a literal's value", async () => {
    const { facts } = await read(WORKSPACE);
    expect(declares(facts, "core/src/lib.rs")).toEqual([
      ["domain", "module", null, null],
      ["util", "module", null, null],
      ["odd", "module", null, null],
      ["missing", "module", null, null],
      ["LIMIT", "const", null, "1000"],
      ["NAME", "static", null, "core\n"],
      ["helper", "function", null, null],
      ["Repository", "trait", "Send", null],
      ["m", "macro", null, null],
      ["tests", "module", null, null],
    ]);
    // impl blocks declare nothing; a union is a struct.
    expect(declares(facts, "core/src/domain/model.rs")).toEqual([
      ["Order", "struct", null, null],
      ["Status", "enum", null, null],
      ["Entity", "trait", "std::fmt::Debug", null],
      ["RATIO", "const", null, "2500"],
      ["NEG", "const", null, "-31"],
      ["ON", "const", null, "true"],
      ["Id", "type", null, null],
      ["U", "struct", null, null],
    ]);
    // Nothing inside an impl or fn is top level.
    expect(declares(facts, "adapters/src/db.rs")).toEqual([["Pool", "struct", null, null]]);
  });

  it("exports plain pub items, #[macro_export] macros and pub use leaves, not pub(crate)", async () => {
    const { facts } = await read(WORKSPACE);
    expect(exportsOf(facts, "core/src/lib.rs")).toEqual(["domain", "odd", "Order from domain::model::Order", "* from self::util::*", "limit from util::clamp", "LIMIT", "NAME", "Repository", "m"]);
    expect(exportsOf(facts, "core/src/domain/model.rs")).toEqual(["Order", "Status", "Entity"]);
    expect(facts.every((f) => f.kind !== "export" || (f.typeOnly === false && f.at === f.module))).toBe(true);
  });

  it("reads literal values as Rust writes them", async () => {
    const { facts } = await read({
      "src/lib.rs": ["const A: u8 = 0b1010_u8;", "const B: f32 = 1_000.5;", 'const C: &str = r#"raw "q""#;', 'const D: &str = "tab\\tend\\u{41}";', "const E: i32 = -7;", "const F: Thing = Thing::new();", "static G: usize = 0o17;", ""].join("\n"),
    });
    expect(declares(facts, "src/lib.rs").map(([s, , , v]) => [s, v])).toEqual([
      ["A", "10"],
      ["B", "1000.5"],
      ["C", 'raw "q"'],
      ["D", "tab\tendA"],
      ["E", "-7"],
      ["F", null],
      ["G", "15"],
    ]);
  });
});
