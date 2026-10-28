import { describe, expect, it } from "vitest";
import { Ledger } from "../src/ledger.ts";

describe("Ledger", () => {
  it("LED-1 rejects a negative amount", () => {
    expect(() => new Ledger().record({ id: "a", cents: -1 })).toThrow();
  });
});
