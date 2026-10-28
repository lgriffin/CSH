// Where a grammar is loaded from (stage 76, A-272): the copy the npm package carries beside the code, else the file the
// grammar's own package ships, as in the workspace.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GRAMMARS, grammarFile } from "../src/parser.ts";

describe("grammarFile", () => {
  it("finds every grammar's WebAssembly file in the workspace, from its package", () => {
    for (const pkg of Object.values(GRAMMARS)) {
      const f = grammarFile(pkg);
      expect(f.replace(/\\/g, "/")).toContain(`/${pkg}/${pkg}.wasm`);
      expect(existsSync(f)).toBe(true);
    }
  });
});
