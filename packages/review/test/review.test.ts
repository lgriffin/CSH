import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { readStoredRun } from "@csh/run";
import { type ManifestView, diffRuns, renderDiff } from "../src/index.ts";

const fx = (id: string, side: string) => readStoredRun(join(import.meta.dirname, "../../../fixtures", id, "inputs", side));
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "../../../fixtures/F111/inputs/component.json"), "utf8")) as ManifestView;

describe("diffRuns", () => {
  it("is empty when a run is compared with itself, and says none in every section", () => {
    const s = fx("F108", "base");
    const d = diffRuns(s, s);
    expect(d.comparison).toBe("made");
    expect(d.signals.appeared).toEqual([]);
    expect(d.signals.cleared).toEqual([]);
    expect(d.obligations).toEqual([]);
    expect(d.fragments).toEqual({ added: [], removed: [], changed: [] });
    expect(renderDiff(d)).toContain("Signals cleared: none");
  });

  it("swaps appeared and cleared when the sides are swapped", () => {
    const b = fx("F108", "base");
    const h = fx("F108", "head");
    const there = diffRuns(b, h);
    const back = diffRuns(h, b);
    expect(back.signals.appeared.map((s) => s.id)).toEqual(there.signals.cleared.map((s) => s.id));
    expect(back.signals.cleared.map((s) => s.id)).toEqual(there.signals.appeared.map((s) => s.id));
  });

  it("never shows an unavailable side as no change", () => {
    const h = fx("F108", "head");
    const d = diffRuns(h, { unavailable: "component-absent" });
    expect(d.comparison).toBe("head-unavailable");
    expect(d.alone?.side).toBe("base");
    expect(renderDiff(d)).toContain("the comparison was not made");
    const neither = diffRuns({ unavailable: "a" }, { unavailable: "b" });
    expect(neither.alone).toBeUndefined();
    expect(renderDiff(neither)).toContain("Neither side could be run");
  });

  it("observes the specification and evidence moving together, and nothing without changed paths", () => {
    const b = fx("F111", "base");
    const h = fx("F111", "head");
    const together = diffRuns(b, h, { manifest, changes: ["spec/lockout.csl.ts", "test/lockout.test.ts"] });
    expect(together.observations).toContainEqual({ k: "rule-and-evidence-moved-together", practices: ["tdd"] });
    expect(together.observations).not.toContainEqual({ k: "spec-untouched" });
    const silent = diffRuns(b, h, { manifest });
    expect(silent.observations.filter((o) => o.k !== "approval-lost" && o.k !== "evidence-removed")).toEqual([]);
    expect(silent.inputs.every((i) => !i.changed)).toBe(true);
  });
});
