// inherits over every supertype (stage 59): the interfaces a Java class implements, a Rust trait's supertraits and what
// a Go struct embeds, as facts-code writes them in `bases`. A path to the base decides it; a path that cannot be read
// leaves it unknown only when no other path reaches the base.
import { describe, expect, it } from "vitest";
import { type ClaimFacts, truthOf } from "../src/index.ts";

const d = (module: string, symbol: string, declares: string, base?: string, bases?: string[], line = 3) => ({ module, symbol, declares, at: `${module}:${line}`, ...(base !== undefined ? { base } : {}), ...(bases !== undefined ? { bases } : {}) });
const facts = (declares: ClaimFacts["declares"], language: string): ClaimFacts => ({ modules: new Set(declares.map((x) => x.module)), declares, exports: [], fields: [], languages: new Map(declares.map((x) => [x.module, language])) });

describe("inherits over every supertype", () => {
  it("follows the interfaces a Java class implements, past one it cannot read", () => {
    const java = facts(
      [
        d("CardStore.java", "CardStore", "interface"),
        d("Cached.java", "Cached", "interface", "Comparable", ["CardStore"]),
        d("Memory.java", "Memory", "class", undefined, ["Cached"]),
        d("Log.java", "Log", "interface"),
        d("Jdbc.java", "Jdbc", "class", "Base", ["Log"]),
        d("Base.java", "Base", "class"),
        d("Odd.java", "Odd", "class", undefined, ["Comparable", "Log"]),
      ],
      "java",
    );
    expect(truthOf({ k: "inherits", cls: "Memory", base: "CardStore" }, java)).toEqual({ value: true, detail: "Memory (Memory.java:3) -> Cached (Cached.java:3) -> CardStore", evidence: [{ at: "Memory.java:3" }, { at: "Cached.java:3" }] });
    expect(truthOf({ k: "inherits", cls: "Jdbc", base: "CardStore" }, java)).toMatchObject({ value: false, detail: "Jdbc (Jdbc.java:3) -> Base (Base.java:3) extends nothing; Jdbc (Jdbc.java:3) -> Log (Log.java:3) extends nothing" });
    // No path reaches the base, and one could not be read: unknown.
    expect(truthOf({ k: "inherits", cls: "Odd", base: "CardStore" }, java)).toEqual({ reason: "base-not-read: Comparable" });
  });

  it("follows a Rust trait's supertraits and a Go struct's embedded fields", () => {
    const rust = facts([d("lib.rs", "Reader", "trait"), d("lib.rs", "Writer", "trait", undefined, undefined, 4), d("lib.rs", "Store", "trait", "Reader", ["Writer"], 5)], "rust");
    expect(truthOf({ k: "inherits", cls: "Store", base: "Writer" }, rust)).toMatchObject({ value: true, detail: "Store (lib.rs:5) -> Writer" });
    const go = facts([d("s.go", "Memory", "struct"), d("s.go", "Audited", "struct", undefined, ["Memory"], 8), d("s.go", "Locked", "struct", undefined, ["sync.Mutex"], 12)], "go");
    expect(truthOf({ k: "inherits", cls: "Audited", base: "Memory" }, go)).toMatchObject({ value: true });
    expect(truthOf({ k: "inherits", cls: "Memory", base: "Audited" }, go)).toMatchObject({ value: false, detail: "Memory (s.go:3) extends nothing" });
    expect(truthOf({ k: "inherits", cls: "Locked", base: "Memory" }, go)).toEqual({ reason: "qualified-base: Locked extends sync.Mutex" });
  });

  it("reports a cycle rather than following it", () => {
    const loop = facts([d("a.java", "A", "interface", "B"), d("b.java", "B", "interface", "A")], "java");
    expect(truthOf({ k: "inherits", cls: "A", base: "C" }, loop)).toEqual({ reason: "cycle: B" });
  });
});
