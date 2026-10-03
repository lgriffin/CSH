import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { typeCheck } from "@csh/emit";

describe("compile-time rules S1 to S5", () => {
  it("every marked line fails to compile and nothing else does", () => {
    const diags = typeCheck(join(import.meta.dirname, "static-rules.ts"));
    expect(diags.map((d) => `${d.line}: ${d.message}`)).toEqual([]);
  });
});
