// The tree-sitter grammars of @csh/facts-code load and parse inside the isolated adapter process (stage 29): the
// sandbox denies the clock, timers, randomness and the network, and allows reading installed packages.
import { describe, expect, it } from "vitest";
import { runIsolated } from "../src/sources.ts";

describe("grammars in the sandbox", () => {
  it("parse a file", async () => {
    const url = new URL("./adapters/parse-adapter.ts", import.meta.url).href;
    const out = await runIsolated(url, {
      source: { name: "Code", kind: "Code", at: "." },
      vocabulary: { units: [], enums: [], states: [], events: [] },
      bindings: [],
      files: [{ path: "a.py", digest: "", bytes: new TextEncoder().encode("import os\nclass A: pass\n") }],
    });
    expect(out.diagnostics).toEqual([{ code: "tree", severity: "info", message: "module 2", span: "a.py" }]);
  });
});
