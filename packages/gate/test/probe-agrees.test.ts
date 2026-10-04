// The gate's probe file repeats the cases of gate.test.ts under Node's test runner (A-49, Q-20 decided). This test keeps
// the two copies from drifting apart: every row of the disposition table appears in both with the same input, mode and
// disposition, and every other probe case names a test of gate.test.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(import.meta.dirname, f), "utf8");
const unit = read("gate.test.ts");
const probe = read("gate.probe.ts");

/** The table rows as "label | input | mode | disposition"; the probe's labels end with " gives <disposition>". */
const rows = (src: string) =>
  [...src.matchAll(/^\s*\["([^"]+)", (\{[^}]*\}), "(\w+)", "(\w+)"(?:, "[\w-]+")?\],?$/gm)].map((m) => `${m[1]!.replace(/ gives \w+$/, "")} | ${m[2]} | ${m[3]} | ${m[4]}`).sort();

describe("the gate's probe and its unit tests", () => {
  it("state the same disposition table", () => {
    expect(rows(probe).length).toBeGreaterThan(0);
    expect(rows(probe)).toEqual(rows(unit));
  });

  it("every other probe case is a unit test", () => {
    const tests = new Set([...unit.matchAll(/^\s*it\("([^"]+)"/gm)].map((m) => m[1]!));
    const cases = [...probe.matchAll(/^test\("([^"]+)"/gm)].map((m) => m[1]!);
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.filter((c) => !tests.has(c))).toEqual([]);
  });
});
