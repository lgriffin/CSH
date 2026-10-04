import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDiagram, splitArgs } from "../src/index.ts";

const repo = join(import.meta.dirname, "../../..");

describe("the C4 Mermaid adapter", () => {
  it("splits arguments with quoted commas", () => {
    expect(splitArgs(`web, "Web", "web, ui", "Pages"`)).toEqual(["web", "Web", "web, ui", "Pages"]);
    expect(splitArgs(`a, "unterminated`)).toBeUndefined();
  });

  it("reads every line of the repository's container diagram (Next layers, section 10)", () => {
    const text = readFileSync(join(repo, "docs/architecture/containers.mmd"), "utf8");
    const { diagram, unliftable } = readDiagram(text, "docs/architecture/containers.mmd");
    expect(unliftable).toEqual([]);
    expect(diagram.relations.length).toBe(text.split("\n").filter((l) => l.trim().startsWith("Rel(")).length);
    const kernel = diagram.elements.find((e) => e.id === "kernel");
    expect(kernel).toMatchObject({ kind: "Container", packages: ["kernel"] });
    expect(diagram.elements.find((e) => e.id === "user")?.packages).toEqual([]);
  });

  it("keeps a line it cannot read as unliftable, with its span", () => {
    const { diagram, unliftable } = readDiagram(`C4Container\n  ContainerDb(x, "X", "pg", "Rows")\n  Container(a, "A", "a", "")\n  BiRel(a, x, "both")\n`, "d.mmd");
    expect(unliftable.map((u) => [u.span, u.reason])).toEqual([["d.mmd:2", "unreadable-line"], ["d.mmd:4", "unreadable-line"]]);
    expect(diagram.elements.map((e) => e.id)).toEqual(["a"]);
  });

  it("reads nothing before the C4Container header", () => {
    expect(readDiagram(`Container(a, "A", "a", "")\n`, "d.mmd").unliftable).toHaveLength(1);
  });
});
