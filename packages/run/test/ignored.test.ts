// The directories a .gitignore says a checkout fills locally (A-292).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ignoredContentDirs } from "../src/sources.ts";

let dir = "";
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("ignoredContentDirs", () => {
  it("reads a wildcard in the last part only, and an escaped one as a literal character", () => {
    dir = mkdtempSync(join(tmpdir(), "csh-ignored-"));
    writeFileSync(join(dir, ".gitignore"), "opponents/*.jar\n/out/build-?.log\nliteral/\\*.txt\nlogs/a\\[1].txt\ndeep/*/x.jar\n# a/*.c\n!keep/*.c\n");
    expect([...ignoredContentDirs(dir, [".gitignore"])].sort()).toEqual(["opponents", "out"]);
  });
});
