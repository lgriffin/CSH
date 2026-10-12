// Structural claims over Java facts (stage 32): the declarations below are those facts-java writes for
// `class B extends A` and `class A extends RuntimeException` (packages/facts-code/test/java.test.ts reads them).
import { describe, expect, it } from "vitest";
import { type ClaimFacts, truthOf } from "../src/index.ts";

const facts: ClaimFacts = {
  modules: new Set(["src/main/java/p/A.java", "src/main/java/p/B.java", "src/main/java/p/C.java"]),
  declares: [
    { module: "src/main/java/p/A.java", symbol: "A", declares: "class", base: "RuntimeException", at: "src/main/java/p/A.java:3" },
    { module: "src/main/java/p/B.java", symbol: "B", declares: "class", base: "A", at: "src/main/java/p/B.java:3" },
    { module: "src/main/java/p/C.java", symbol: "C", declares: "class", base: "q.Base", at: "src/main/java/p/C.java:3" },
    { module: "src/main/java/p/A.java", symbol: "A.CODE", declares: "const", value: "42", at: "src/main/java/p/A.java:4" },
  ],
  exports: [{ module: "src/main/java/p/B.java", symbol: "B", at: "src/main/java/p/B.java:3" }],
  fields: [],
  languages: new Map([
    ["src/main/java/p/A.java", "java"],
    ["src/main/java/p/B.java", "java"],
    ["src/main/java/p/C.java", "java"],
  ]),
};

describe("claims over Java facts", () => {
  it("follow a chain of bases to a Java exception", () => {
    expect(truthOf({ k: "inherits", cls: "B", base: "RuntimeException" }, facts)).toMatchObject({ value: true, detail: "B (src/main/java/p/B.java:3) -> A (src/main/java/p/A.java:3) -> RuntimeException" });
    expect(truthOf({ k: "inherits", cls: "B", base: "IOException" }, facts)).toMatchObject({ value: false, detail: expect.stringContaining("ends at RuntimeException") });
    // A qualified base, as Java may write one, names a class through a binding that is not followed.
    expect(truthOf({ k: "inherits", cls: "C", base: "Base" }, facts)).toEqual({ reason: "qualified-base: C extends q.Base" });
  });

  it("read a member constant and a public type", () => {
    expect(truthOf({ k: "declares", module: "src/main/java/p/A.java", symbol: "A.CODE" }, facts)).toMatchObject({ value: true });
    expect(truthOf({ k: "exports", module: "src/main/java/p/B.java", symbol: "B" }, facts)).toMatchObject({ value: true });
    expect(truthOf({ k: "exports", module: "src/main/java/p/A.java", symbol: "A" }, facts)).toMatchObject({ value: false });
  });
});
