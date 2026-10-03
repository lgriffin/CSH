// The two new sides of the triangle (Anchor, harnesses and A3, section 11.1). Continuous integration executes the root
// README's command blocks (node packages/testkit/src/triangle.ts readme); this test checks the examples against the
// container diagram, and that the README has the blocks the three doors need.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { commandBlocks, declaredContainers, reaches, runtimeContainers } from "../src/triangle.ts";

const repo = resolve(import.meta.dirname, "../../..");
const examples = readdirSync(join(repo, "examples")).filter((e) => existsSync(join(repo, "examples", e, "README.md"))).sort();

describe("examples and C4", () => {
  const containers = runtimeContainers(repo);

  it("reads the runtime containers of the diagram", () => {
    expect(containers).toContain("run");
    expect(containers).toContain("a3");
    expect(containers).not.toContain("testkit");
  });

  it.each(examples)("%s declares the containers it exercises, and its commands reach each one", (e) => {
    const dir = join(repo, "examples", e);
    const declared = declaredContainers(readFileSync(join(dir, "README.md"), "utf8"));
    expect(declared, `examples/${e}/README.md has no "Containers it exercises" section`).toBeDefined();
    for (const c of declared!) {
      expect(containers, `examples/${e} declares ${c}, which the container diagram does not draw`).toContain(c);
      expect(reaches(dir, c), `examples/${e} declares ${c}, but nothing it runs reaches it`).toBe(true);
    }
  });

  it("every container is exercised by at least one example", () => {
    const covered = new Set(examples.flatMap((e) => declaredContainers(readFileSync(join(repo, "examples", e, "README.md"), "utf8")) ?? []));
    expect(containers.filter((c) => !covered.has(c)), "containers with no example").toEqual([]);
  });

  it("knows how to recognise every container", () => {
    for (const c of containers) expect(reaches(join(repo, "examples", "lockout"), c), c).toBeTypeOf("boolean");
  });
});

describe("docs and examples", () => {
  const readme = readFileSync(join(repo, "README.md"), "utf8");

  it("the root README opens with three doors", () => {
    for (const door of ["See it", "Use it", "Understand it"]) expect(readme).toMatch(new RegExp(`^## ${door}$`, "m"));
  });

  it("the root README's command blocks cover the walkthrough, the starter and the checks", () => {
    const blocks = commandBlocks(readme).join("\n");
    expect(blocks).toMatch(/examples\/lockout\/walkthrough\.sh/);
    expect(blocks).toMatch(/cp -r examples\/starter/);
    expect(blocks).toMatch(/npx csh run/);
    expect(blocks).toMatch(/pnpm test/);
  });

  it("finds only blocks marked sh", () => {
    expect(commandBlocks("```sh\na\n```\n```\nb\n```\n```sh\nc\nd\n```\n")).toEqual(["a", "c\nd"]);
  });
});
