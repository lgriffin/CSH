import { describe, expect, it } from "vitest";
import { digestOf } from "@csh/kernel";
import type { AdapterInput } from "@csh/witness";
import { classify, run } from "../src/index.ts";

function input(files: Record<string, string>, config?: Record<string, string>): AdapterInput {
  return {
    source: { name: "Product", kind: "Requirements", at: "req.md" },
    vocabulary: { units: [], enums: [], states: [], events: [] },
    bindings: [],
    files: Object.entries(files).map(([path, text]) => {
      const bytes = new TextEncoder().encode(text);
      return { path, digest: digestOf(bytes), bytes };
    }),
    ...(config !== undefined ? { config } : {}),
  };
}

describe("EARS Markdown adapter", () => {
  it.each([
    ["The system shall log every withdrawal.", "ubiquitous"],
    ["When a withdrawal is requested, the system shall check the balance.", "event-driven"],
    ["While the account is frozen, the system shall refuse withdrawals.", "state-driven"],
    ["If the amount exceeds the balance, then the system shall refuse it.", "unwanted-behaviour"],
    ["While frozen, when a withdrawal is requested, the system shall refuse it.", "complex"],
    ["Where overdrafts are enabled, the system shall allow a negative balance.", "optional-feature"],
    ["Withdrawals should be quick.", undefined],
  ])("classifies %j", (text, pattern) => {
    expect(classify(text)).toBe(pattern);
  });

  it("identifies table rows, list items and bare lines", () => {
    const md = ["| REQ-1 | The system shall log. |", "- **REQ-2**: When asked, the system shall answer.", "REQ-3. Nice things are nice.", "Prose with REQ-4 inside."].join("\n");
    const out = run(input({ "req.md": md }));
    expect(out.items!.map((i) => [i.id, i.pattern, i.span])).toEqual([
      ["REQ-1", "ubiquitous", "req.md:1"],
      ["REQ-2", "event-driven", "req.md:2"],
      ["REQ-3", "none", "req.md:3"],
    ]);
    expect(out.items![0]!.textDigest).toBe(digestOf("The system shall log."));
    expect(out.diagnostics.map((d) => d.code)).toEqual(["no-pattern"]);
  });

  it("reports duplicate identifiers", () => {
    const out = run(input({ "a.md": "REQ-1 The system shall a.", "b.md": "REQ-1 The system shall b." }));
    expect(out.items).toHaveLength(1);
    expect(out.diagnostics[0]!.code).toBe("duplicate-id");
    expect(out.diagnostics[0]!.span).toBe("b.md:1");
  });

  it("marks optional-feature requirements unliftable with feature-scope", () => {
    const out = run(input({ "a.md": "REQ-1 Where overdrafts are enabled, the system shall allow it." }));
    expect(out.claims!.unliftable.map((u) => u.reason)).toEqual(["feature-scope"]);
  });

  it("honours a configured identifier pattern and is deterministic", () => {
    const files = { "b.md": "ACC_7 The system shall b.", "a.md": "ACC_2 The system shall a." };
    const a = run(input(files, { requirementIdPattern: "ACC_[0-9]+" }));
    expect(a.items!.map((i) => i.id)).toEqual(["ACC_2", "ACC_7"]);
    const b = run(input({ "a.md": files["a.md"], "b.md": files["b.md"] }, { requirementIdPattern: "ACC_[0-9]+" }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
