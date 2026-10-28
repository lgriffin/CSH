// The npm package (stage 76, ADR-36): its manifest, and unpacking a packed package without a tar command. CI's
// `npm package` job installs the real package three ways (.github/scripts/npm-smoke.sh).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { CARRIED, NPM_BINS, NPM_NAME, npmManifest, untar } from "../src/npm-package.ts";

const bundled = [
  { name: "@csh/kernel", version: "1.0.0" },
  { name: "@csh/solver", version: "1.0.0", dependencies: { "@csh/kernel": "1.0.0", "z3-solver": "5.2.0" } },
  { name: "@csh/emit", version: "1.0.0", dependencies: { "@csh/kernel": "1.0.0", typescript: "5.9.3" } },
  { name: "@csh/facts-ts", version: "1.0.0", dependencies: { typescript: "5.9.3" } },
  { name: "csl", version: "1.0.0" },
];

describe("npmManifest", () => {
  const m = npmManifest(NPM_NAME, "1.0.0", bundled) as Record<string, any>;

  it("is public, named as the owner chose, with every command", () => {
    expect(m.name).toBe("@lgriffin/csh");
    expect(m.private).toBeUndefined();
    expect(Object.keys(m.bin).sort()).toEqual(["csh", "csh-agent", "cshx", "csl"]);
    expect(Object.keys(NPM_BINS).sort()).toEqual(Object.keys(m.bin).sort());
    expect(m.engines.node).toBe(">=22.18");
  });

  it("bundles every workspace package and depends on each registry package once, at its exact version", () => {
    expect(m.bundleDependencies).toEqual(["@csh/emit", "@csh/facts-ts", "@csh/kernel", "@csh/solver", "csl"]);
    expect(m.dependencies).toEqual({ typescript: "5.9.3", "z3-solver": "5.2.0", "@csh/emit": "1.0.0", "@csh/facts-ts": "1.0.0", "@csh/kernel": "1.0.0", "@csh/solver": "1.0.0", csl: "1.0.0" });
  });

  it("refuses two versions of one registry package", () => {
    expect(() => npmManifest(NPM_NAME, "1.0.0", [...bundled, { name: "@csh/x", version: "1.0.0", dependencies: { typescript: "5.8.0" } }])).toThrow(/typescript is wanted at 5.9.3 and at 5.8.0/);
  });

  it("carries the four grammars into facts-code", () => {
    expect(Object.keys(CARRIED).sort()).toEqual(["tree-sitter-go", "tree-sitter-java", "tree-sitter-python", "tree-sitter-rust"]);
    expect(new Set(Object.values(CARRIED).map((c) => c.into))).toEqual(new Set(["@csh/facts-code"]));
  });
});

/** A ustar entry: a 512-byte header and the body padded to 512 bytes. */
function entry(name: string, body: string, type = "0"): Buffer {
  const h = Buffer.alloc(512);
  h.write(name.slice(0, 100), 0);
  h.write(`${Buffer.byteLength(body).toString(8).padStart(11, "0")}\0`, 124);
  h.write(type, 156);
  h.write("ustar\0", 257);
  const b = Buffer.from(body);
  return Buffer.concat([h, b, Buffer.alloc((512 - (b.length % 512)) % 512)]);
}

describe("untar", () => {
  let dir: string | undefined;
  afterEach(() => dir !== undefined && rmSync(dir, { recursive: true, force: true }));

  it("unpacks files, and the long name a pax header gives", () => {
    dir = mkdtempSync(join(tmpdir(), "csh-untar-"));
    const long = `package/${"d".repeat(120)}/file.js`;
    const pax = `${long.length + 7 + String(long.length + 7).length} path=${long}\n`;
    const tgz = join(dir, "p.tgz");
    writeFileSync(tgz, gzipSync(Buffer.concat([entry("package/package.json", '{"name":"x"}'), entry("PaxHeader", pax, "x"), entry("package/short", "long body"), Buffer.alloc(1024)])));
    untar(tgz, join(dir, "out"));
    expect(readFileSync(join(dir, "out", "package", "package.json"), "utf8")).toBe('{"name":"x"}');
    expect(readFileSync(join(dir, "out", ...long.split("/")), "utf8")).toBe("long body");
  });

  it("refuses a name outside the directory", () => {
    dir = mkdtempSync(join(tmpdir(), "csh-untar-"));
    const tgz = join(dir, "p.tgz");
    writeFileSync(tgz, gzipSync(Buffer.concat([entry("../escape", "x"), Buffer.alloc(1024)])));
    expect(() => untar(tgz, join(dir!, "out"))).toThrow(/outside the package/);
  });
});
