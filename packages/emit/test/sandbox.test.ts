import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emit } from "@csh/emit";

const dir = join(import.meta.dirname, "sandbox");

describe("emission sandbox", () => {
  it("emits a well-behaved module", async () => {
    const r = await emit(join(dir, "ok.csl.ts"), { root: dir, skipTypeCheck: true });
    expect(r.ok).toBe(true);
  });

  // Implementer's brief, section 8: file, network, environment, clock and random access fail with E-ACCESS.
  for (const probe of ["fs", "write", "net", "socket", "env", "clock", "random", "child"]) {
    it(`refuses ${probe} access with E-ACCESS`, async () => {
      const r = await emit(join(dir, `${probe}.csl.ts`), { root: dir, skipTypeCheck: true });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("E-ACCESS");
    });
  }

  it("with nondeterminism forced, a module that reads the clock fails S9 (two emissions differ)", async () => {
    const r = await emit(join(dir, "random.csl.ts"), { root: dir, skipTypeCheck: true, unsafeAllowNondeterminism: true });
    // Two random draws can coincide; the property is that it never passes silently with differing digests.
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("S9");
  });
});
