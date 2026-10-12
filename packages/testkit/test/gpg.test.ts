// Git for Windows' gpg, found when gpg is not on PATH (stage 53).
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { gitForWindowsGpgDir } from "../src/git.ts";

describe("gpg on Windows", () => {
  it("finds usr/bin beside Git's exec path when it holds gpg.exe", () => {
    const root = resolve("/Program Files/Git");
    const usrBin = join(root, "usr", "bin");
    expect(gitForWindowsGpgDir(`${join(root, "mingw64", "libexec", "git-core")}\n`, (p) => p === join(usrBin, "gpg.exe"))).toBe(usrBin);
    expect(gitForWindowsGpgDir(join(root, "mingw64", "libexec", "git-core"), () => false)).toBeUndefined();
  });
});
