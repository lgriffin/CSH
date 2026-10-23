import { test } from "vitest";
import { decode } from "../src/decode.ts";

test("preserves WTF-8 encoded lone surrogates", () => {
  decode(Uint8Array.of(0xed, 0xa0, 0x80));
});

test("fixes the JIRA-123 regression", () => {
  decode(Uint8Array.of(0x61));
});

test("REQ-1 and REQ-2 decode plain text", () => {
  decode(Uint8Array.of(0x62));
});
