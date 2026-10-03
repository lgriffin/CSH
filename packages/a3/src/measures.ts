// The default measures (Anchor, harnesses and A3, sections 5.9 and 12): eight separate rows, each with an id so a
// target can be overridden, never combined into a score.
import { matches } from "@csh/check";
import type { A3Model, Judgments, SheetStage } from "./types.ts";

export interface Measure {
  id: string;
  name: string;
  target: string;
  /** A count whose target is a ceiling, a share whose target is "all" or a floor, or the gate. */
  shape: "count" | "share" | "gate";
  count?: (st: SheetStage, j: Judgments) => number;
  share?: (st: SheetStage) => { n: number; of: number };
}

const kinds = (st: SheetStage, ks: string[]) => st.signals.filter((s) => ks.includes(s.kind)).length;
/** Decision points of a class with at least one signal at the stage. */
const disputed = (st: SheetStage, j: Judgments, cls: string) => j.decisionPoints.filter((d) => d.class === cls && st.signals.some((s) => d.match.some((m) => matches(s, m)))).length;

export const MEASURES: Measure[] = [
  { id: "conflicts", name: "Conflicts between claims", target: "0", shape: "count", count: (st) => st.conflicts },
  { id: "not-comparable", name: "Not comparable", target: "0", shape: "count", count: (st) => kinds(st, ["not-comparable"]) },
  { id: "drift", name: "Shape mismatches and dangling citations", target: "0", shape: "count", count: (st) => kinds(st, ["shape-mismatch", "dangling-citation"]) },
  { id: "no-rule", name: "Examples with no rule", target: "0", shape: "count", count: (st) => kinds(st, ["no-rule"]) },
  { id: "silences", name: "Silences without an owner decision", target: "0", shape: "count", count: (st, j) => disputed(st, j, "silence") },
  { id: "satisfied", name: "Rules satisfied on approved evidence", target: "all", shape: "share", share: (st) => ({ n: st.rules.filter((r) => r.verdict === "satisfied" && r.authority === "approved").length, of: st.rules.length }) },
  { id: "gate", name: "Enforcing gate allows", target: "allow", shape: "gate" },
  { id: "cited", name: "Examples that cite a requirement", target: "all", shape: "share", share: (st) => ({ n: st.examples.citing, of: st.examples.total }) },
];

function evaluate(m: Measure, target: string, st: SheetStage, j: Judgments): { value: string; met: boolean } {
  if (m.shape === "gate") {
    const value = st.gate.mode === "enforcing" ? st.gate.overall : `${st.gate.overall} (${st.gate.mode})`;
    return { value, met: st.gate.mode === "enforcing" && st.gate.overall === target };
  }
  if (m.shape === "share") {
    const { n, of } = m.share!(st);
    const floor = target === "all" ? of : Number(target);
    return { value: `${n} of ${of}`, met: target === "all" ? of > 0 && n === of : Number.isFinite(floor) && n >= floor };
  }
  const n = m.count!(st, j);
  const ceiling = Number(target);
  return { value: String(n), met: Number.isFinite(ceiling) && n <= ceiling };
}

/** Every measure at every stage, with the judgments' targets where they differ from the defaults. */
export function measureValues(stages: SheetStage[], j: Judgments): A3Model["measures"] {
  return MEASURES.map((m) => {
    const target = j.targets?.[m.id] ?? m.target;
    return { id: m.id, name: m.name, target, values: stages.map((st) => evaluate(m, target, st, j)) };
  });
}
