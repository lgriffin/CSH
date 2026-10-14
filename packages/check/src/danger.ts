// Danger (Analyse, danger and grain, section 3; stage 56): a view across the three outcomes, never a fourth outcome
// and never a score. An entry keeps its outcome and is also marked dangerous when it has one of two structures:
// refuted, where a statement and the code cannot both hold; or masked, where something reads as assurance and the
// evidence does not bear the assurance out. Masked danger is established from what the report holds, never inferred:
// each shape below names the green it reads as and the one input that would close it.
import type { Report } from "./types.ts";

export type DangerStructure = "refuted" | "masked";

/**
 * The shapes established in stage 56. Refuted: the code breaks a rule (`code-breaks-rule`), or refutes what prose says
 * of it (`code-refutes-prose`). Masked: a passing test whose own witness violates a rule (`green-over-refuted`); a
 * passing test whose observation no rule constrains (`test-under-no-rule`); a
 * sentence or stated status claiming a rung the ladder does not find (`rung-overclaimed`); an approved rule no example
 * exercises (`silence-beside-rule`); a convergence whose approval is its author's own (`self-approved`).
 */
export type DangerShape = "code-breaks-rule" | "code-refutes-prose" | "green-over-refuted" | "test-under-no-rule" | "rung-overclaimed" | "silence-beside-rule" | "self-approved";

export interface Danger {
  structure: DangerStructure;
  shape: DangerShape;
  /** The rule, obligation or item the danger is about. */
  of: string;
  /** For masked danger, what reads as assurance. */
  green?: string;
  /** The one input that would close it. */
  close: string;
}

/** Signal kinds where the code (its facts, the model's transitions, the file tree) breaks a rule. */
const BREAKS = new Set(["violated", "not-met", "not-preserved"]);
/** Signal kinds where the code refutes what a statement says of it. */
const REFUTES_PROSE = new Set(["fact-conflict", "claim-conflict", "arch-conflict", "dangling-reference"]);

const CLOSE: Record<DangerShape, string> = {
  "code-breaks-rule": "Fix what breaks the rule, or revise the rule",
  "code-refutes-prose": "Correct the statement the code refutes, or the code if the statement is the intent",
  "green-over-refuted": "Fix the implementation so what the test observes meets the statement, or revise the statement: the test passing is not the statement holding",
  "test-under-no-rule": "State the rule the test observes, or cite the one it exercises",
  "rung-overclaimed": "Name the mechanism the claim rests on (a test that cites it, a rule the check can decide), or state it without the claim",
  "silence-beside-rule": "Add a boundary example that exercises the approved rule",
  "self-approved": "Have a second maintainer approve it",
};

const RUNG_ORDER = ["L2", "L3", "L4", "L5"];

/** The danger judgements for one report, by the kind of thing an overview entry is made from. */
export interface DangerJudge {
  /** A signal: its kind, its fragments, its subject, and whether it is a finding (which carries its members' verdicts). */
  signal(kind: string, fragments: string[], subject: string, finding: boolean): Danger | undefined;
  /** An obligation the overview reads from its assessment (satisfied or unknown). */
  obligation(fragment: string, verdict: string): Danger | undefined;
}

export function dangerJudge(report: Report): DangerJudge {
  const assessments = report.assessments ?? [];
  const byFragment = new Map(assessments.map((a) => [a.fragment, a]));
  const passed = new Map<string, string>();
  for (const e of report.executions ?? []) if (e.localResult === "passed") passed.set(`${e.source}\u0000${e.witness}`, e.test ?? e.witness);
  // The examples lifted from witnesses, with the test each came from and whether it passed.
  const observed = new Map<string, { test: string; passed: boolean }>();
  for (const e of report.executions ?? []) if (e.example !== undefined) observed.set(e.example, { test: e.test ?? e.witness, passed: e.localResult === "passed" });
  const items = new Map((report.items ?? []).map((i) => [`${i.source}/${i.id}`, i]));
  const rungOf = new Map((report.rungs ?? []).map((r) => [r.item, r.rung]));
  const approved = (f: string) => byFragment.get(f)?.authority === "approved";
  const make = (structure: DangerStructure, shape: DangerShape, of: string, green?: string): Danger => ({ structure, shape, of, ...(green !== undefined ? { green } : {}), close: CLOSE[shape] });

  return {
    signal(kind, fragments, subject, finding) {
      // A rule the evidence violates, through a witness whose test passed: the lockout regression's shape. Only the
      // signal that reports the violation carries it (the violation, or the finding that names it); a gap about the
      // same rule, such as single-source, says something else.
      const violated = kind === "violated" || finding ? fragments.map((f) => byFragment.get(f)).filter((a) => a !== undefined && a.verdict === "violated") : [];
      for (const a of violated) {
        for (const ev of a!.evidence) {
          if (ev.result !== "violated") continue;
          const test = passed.get(`${ev.source}\u0000${ev.witness}`);
          if (test !== undefined) return make("masked", "green-over-refuted", a!.fragment, `the test ${test} passes`);
        }
      }
      // A finding between a told statement and an example a test observed: the code and the statement cannot both hold.
      if (finding) {
        const seen = fragments.filter((f) => observed.has(f));
        const told = fragments.filter((f) => !observed.has(f));
        if (seen.length > 0 && told.length > 0) {
          const green = seen.find((f) => observed.get(f)!.passed);
          return green !== undefined ? make("masked", "green-over-refuted", told[0]!, `the test ${observed.get(green)!.test} passes`) : make("refuted", "code-breaks-rule", told[0]!);
        }
      }
      if (violated.length > 0 || BREAKS.has(kind)) return make("refuted", "code-breaks-rule", violated[0]?.fragment ?? fragments[0] ?? subject);
      if (REFUTES_PROSE.has(kind)) return make("refuted", "code-refutes-prose", fragments[0] ?? subject);
      if (kind === "status-unsupported") {
        const status = items.get(subject)?.attrs?.status;
        return make("masked", "rung-overclaimed", subject, status !== undefined ? `its stated status is ${status}` : "its stated status");
      }
      if (kind === "unverified") {
        const claim = items.get(subject)?.attrs?.claims;
        const rung = rungOf.get(subject);
        if (claim !== undefined && (rung === undefined || RUNG_ORDER.indexOf(rung) < RUNG_ORDER.indexOf("L3"))) return make("masked", "rung-overclaimed", subject, `it says "${claim}", and the ladder finds ${rung ?? "L2"}`);
      }
      if (kind === "no-rule") {
        const f = fragments.find((x) => observed.get(x)?.passed === true);
        if (f !== undefined) return make("masked", "test-under-no-rule", f, `the test ${observed.get(f)!.test} passes`);
      }
      if (kind === "no-example") {
        const f = fragments.find(approved);
        if (f !== undefined) return make("masked", "silence-beside-rule", f, "the rule is approved");
      }
      return undefined;
    },
    obligation(fragment, verdict) {
      const a = byFragment.get(fragment);
      if (verdict === "satisfied" && a?.authority === "approved" && a.selfApproved) return make("masked", "self-approved", fragment, "an approval, by the rule's own author");
      return undefined;
    },
  };
}

/** How many entries carry each structure. */
export function dangerCounts(entries: { danger?: Danger }[]): Record<DangerStructure, number> {
  const c = { refuted: 0, masked: 0 };
  for (const e of entries) if (e.danger !== undefined) c[e.danger.structure]++;
  return c;
}

/** One line for a dangerous entry: its structure and shape, what reads green, and what would close it. */
export function dangerLine(d: Danger): string {
  return `${d.structure}, ${d.shape.replace(/-/g, " ")}${d.green !== undefined ? `: ${d.green}` : ""}`;
}
