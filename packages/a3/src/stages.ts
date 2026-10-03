// Stage records (Anchor, harnesses and A3, section 5.7): a run's run.json, report.json and gate.json, copied into
// csh/a3/<slug>/stages/<id>/ and committed, so the sheet reads correctly after its branches are gone.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { digestOf } from "@csh/kernel";
import { A3_DIR, type Judgments, JUDGMENTS_SCHEMA, MARKS, type StageRecord } from "./types.ts";

export const STAGE_FILES = ["run.json", "report.json", "gate.json"] as const;

/** The directory of one A3 inside a component root. */
export function a3Dir(root: string, slug: string): string {
  return join(root, A3_DIR, slug);
}

export function stageDir(root: string, slug: string, id: string): string {
  return join(a3Dir(root, slug), "stages", id);
}

/** A slug or stage id: lower case letters, digits and hyphens, so it is safe as a directory name. */
export const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Read one stage record; undefined when any of its three files is missing. */
export function readStage(dir: string, id: string): StageRecord | undefined {
  if (!STAGE_FILES.every((f) => existsSync(join(dir, f)))) return undefined;
  const reportBytes = readFileSync(join(dir, "report.json"));
  const gateBytes = readFileSync(join(dir, "gate.json"));
  return {
    id,
    run: JSON.parse(readFileSync(join(dir, "run.json"), "utf8")),
    report: JSON.parse(reportBytes.toString("utf8")),
    gate: JSON.parse(gateBytes.toString("utf8")),
    digests: { report: digestOf(new Uint8Array(reportBytes)), gate: digestOf(new Uint8Array(gateBytes)) },
  };
}

export type VerifyProblem = "stage-mismatch" | "stage-unverifiable";

/**
 * A stage's own consistency: report.json and gate.json must be the files its run record names, byte for byte. An
 * edited report fails here before anything is re-run.
 */
export function stageIntegrity(s: StageRecord): { problem: VerifyProblem; detail: string } | undefined {
  if (s.run.reportDigest !== s.digests.report) return { problem: "stage-mismatch", detail: `report.json is ${s.digests.report}; the run record names ${s.run.reportDigest}` };
  if (s.run.gateDigest !== s.digests.gate) return { problem: "stage-mismatch", detail: `gate.json is ${s.digests.gate}; the run record names ${s.run.gateDigest}` };
  return undefined;
}

/** Structural checks of a judgments file. Every problem is reported; none is repaired. */
export function validateJudgments(v: unknown): string[] {
  const out: string[] = [];
  const isRec = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
  if (!isRec(v)) return ["the judgments must be a JSON object"];
  if (v.schema !== JUDGMENTS_SCHEMA) out.push(`schema must be ${JUDGMENTS_SCHEMA}`);
  for (const k of ["title", "problem", "goal"]) if (typeof v[k] !== "string") out.push(`${k} must be a string`);
  if (!isRec(v.cannotSay)) out.push("cannotSay must be an object keyed by practice id");
  for (const k of ["background", "stages", "lanes", "causes", "decisionPoints", "rca", "whys", "countermeasures", "plan"]) if (!Array.isArray(v[k])) out.push(`${k} must be a list`);
  if (Array.isArray(v.stages)) {
    const ids = new Set<string>();
    for (const s of v.stages as unknown[]) {
      if (!isRec(s) || typeof s.id !== "string" || !SLUG.test(s.id)) out.push("every stage needs an id of lower case letters, digits and hyphens");
      else if (ids.has(s.id)) out.push(`stage ${s.id} is listed twice`);
      else ids.add(s.id);
    }
  }
  const matchList = (where: string, m: unknown) => {
    if (!Array.isArray(m) || !m.every((x) => isRec(x) && typeof x.kind === "string")) out.push(`${where}: match must be a list of rules, each with a kind`);
  };
  for (const k of ["lanes", "causes", "decisionPoints"] as const) if (Array.isArray(v[k])) for (const [i, x] of (v[k] as unknown[]).entries()) matchList(`${k}[${i}]`, isRec(x) ? x.match : undefined);
  // A decision point's marks become class names on the page, and its evidence is read as a pointer: both are checked.
  if (Array.isArray(v.decisionPoints))
    for (const [i, d] of (v.decisionPoints as unknown[]).entries()) {
      const says = isRec(d) ? d.says : undefined;
      if (!isRec(says) || !Object.values(says).every((c) => isRec(c) && (MARKS as readonly unknown[]).includes(c.mark) && typeof c.text === "string")) out.push(`decisionPoints[${i}]: says must map each practice to a mark (${MARKS.join(", ")}) and a text`);
    }
  const pointer = (p: unknown) => isRec(p) && ("finding" in p ? typeof p.finding === "string" && typeof p.stage === "string" : typeof p.file === "string" && typeof p.text === "string" && (p.stage === undefined || typeof p.stage === "string"));
  for (const k of ["rca", "whys"] as const)
    if (Array.isArray(v[k])) for (const [i, x] of (v[k] as unknown[]).entries()) if (!isRec(x) || (x.evidence !== undefined && !pointer(x.evidence))) out.push(`${k}[${i}]: evidence must be { file, text, stage? } or { finding, stage }`);
  if (Array.isArray(v.countermeasures))
    for (const [i, c] of (v.countermeasures as unknown[]).entries()) {
      if (!isRec(c) || typeof c.id !== "string" || !Array.isArray(c.answers)) out.push(`countermeasures[${i}] needs an id and a list of the questions it answers`);
      else for (const k of ["clears", "expects"]) if (c[k] !== undefined) matchList(`countermeasure ${c.id} ${k}`, c[k]);
    }
  return out;
}

/** Read csh/a3/<slug>/judgments.json: its bytes (whose digest the ledger approves) and the parsed judgments. */
export function readJudgments(root: string, slug: string): { bytes: Uint8Array; judgments: Judgments; problems: string[] } | undefined {
  const file = join(a3Dir(root, slug), "judgments.json");
  if (!existsSync(file)) return undefined;
  const bytes = new Uint8Array(readFileSync(file));
  let v: unknown;
  try {
    v = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    return { bytes, judgments: undefined as never, problems: [`judgments.json is not JSON: ${(err as Error).message}`] };
  }
  return { bytes, judgments: v as Judgments, problems: validateJudgments(v) };
}
