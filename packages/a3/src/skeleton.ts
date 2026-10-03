// The judgments skeleton csh a3 open writes (Anchor, harnesses and A3, section 5.8): one stage, one lane per
// practice, and every judged section empty, so every signal shows as unclassified until a person places it.
import type { Practice } from "@csh/component";
import { type Judgments, JUDGMENTS_SCHEMA } from "./types.ts";

export function skeleton(stage: string, practices: Practice[]): Judgments {
  return {
    schema: JUDGMENTS_SCHEMA,
    title: "",
    problem: "",
    background: [],
    stages: [{ id: stage, name: "", what: "" }],
    cannotSay: {},
    lanes: practices.map((p) => ({ id: p.id, practice: p.id, step: 1, title: p.name, where: p.sources.join(", "), match: [] })),
    causes: [],
    decisionPoints: [],
    goal: "",
    rca: [],
    whys: [],
    countermeasures: [],
    plan: [],
  };
}
