// The Assertion Ladder (The Assertion Ladder, stage 46): how strongly the repository asserts each told rule, beside the
// outcome its results land in. A rung is the highest one the evidence establishes, a floor and never a guess, and it
// counts only what stops a wrong change in the repository itself: its tests and scenarios, its compiler, and the
// obligations of its own specification that a person approved. A candidate obligation is CSH's reading, not the
// repository's assertion, and never raises a rung. The rung decides no outcome and moves none.
import { compareCodePoints, type Fragment } from "@csh/kernel";
import { archRuleOf } from "./arch.ts";
import type { Assessment, Report } from "./types.ts";

export type Rung = "L2" | "L3" | "L4" | "L5";
export const RUNGS: Rung[] = ["L2", "L3", "L4", "L5"];
export const RUNG_NAMES: Record<Rung, string> = { L2: "told", L3: "checked", L4: "explained", L5: "prevented" };

export interface RungEntry {
  /** The told rule, as Source/id. */
  item: string;
  rung: Rung;
  /** Each mechanism found, with the rung it supports, strongest first. */
  by: { rung: Rung; mechanism: string }[];
}

/** Item kinds that state a rule; an item with no kind is a sentence the EARS adapter read, a rule too. */
const TOLD = new Set(["requirement", "rule", "property"]);

export function isToldRule(item: { kind?: string }): boolean {
  return item.kind === undefined || TOLD.has(item.kind);
}

export interface LadderInput {
  items: Report["items"];
  /** From trace: what an edge says checks each item. */
  checks: Map<string, string[]>;
  /** Every fragment of the model, for what each cites and what it is. */
  fragments: Fragment[];
  assessments: Assessment[];
  /** Example fragments, each with the items it cites as Source/id. */
  examples: NonNullable<Report["examples"]>;
}

export function rungsOf(input: LadderInput): RungEntry[] {
  const by = new Map<string, RungEntry["by"]>();
  const add = (item: string, rung: Rung, mechanism: string) => {
    const list = by.get(item) ?? [];
    if (!list.some((x) => x.rung === rung && x.mechanism === mechanism)) by.set(item, [...list, { rung, mechanism }]);
  };
  for (const [item, hows] of input.checks) for (const how of hows) add(item, "L3", how);
  for (const x of input.examples) for (const c of x.cites) add(c, "L3", `example ${x.fragment}`);
  const assessed = new Map(input.assessments.map((a) => [a.fragment, a]));
  for (const f of input.fragments) {
    if (f.cites.length === 0) continue;
    const a = assessed.get(f.name);
    if (a === undefined) continue;
    const rule = f.kind === "architecture" ? archRuleOf(f) : undefined;
    // A complete mapping the compiler checks prevents the wrong form, whoever wrote the claim that says so.
    if (rule?.k === "claim" && rule.p.k === "total" && rule.holds && a.verdict === "satisfied") {
      for (const c of f.cites) add(`${c.source}/${c.id}`, "L5", `${rule.p.symbol} in ${rule.p.module} maps every member of ${rule.p.over}, checked by its compiler (${f.name})`);
      continue;
    }
    if (a.authority === "approved") for (const c of f.cites) add(`${c.source}/${c.id}`, "L4", `approved obligation ${f.name}, which the enforcing gate stops on and explains`);
  }
  const out: RungEntry[] = [];
  for (const it of input.items) {
    if (!isToldRule(it)) continue;
    const item = `${it.source}/${it.id}`;
    const list = (by.get(item) ?? []).sort((a, b) => RUNGS.indexOf(b.rung) - RUNGS.indexOf(a.rung) || compareCodePoints(a.mechanism, b.mechanism));
    out.push({ item, rung: list[0]?.rung ?? "L2", by: list });
  }
  return out.sort((a, b) => compareCodePoints(a.item, b.item));
}

/** How many told rules sit at each rung. */
export function ladderCounts(rungs: { rung: Rung }[]): Record<Rung, number> {
  const counts: Record<Rung, number> = { L2: 0, L3: 0, L4: 0, L5: 0 };
  for (const r of rungs) counts[r.rung]++;
  return counts;
}

/** The ladder in one line, for the overview's text. */
export function ladderLine(counts: Record<Rung, number>): string {
  return `Assertion Ladder: ${RUNGS.map((r) => `${counts[r]} ${RUNG_NAMES[r]} (${r})`).join(", ")}`;
}

/** What `csh ladder` prints: every told rule, weakest first, with its mechanisms and the outcomes of its entries. */
export interface Ladder {
  schema: "csh-ladder/v1";
  counts: Record<Rung, number>;
  rules: (RungEntry & { outcomes: { outcome: string; kind: string }[] })[];
}

/** The ladder of a report, read with its overview so each rule carries the outcomes it already landed in. */
export function ladderOf(report: Pick<Report, "rungs">, overview: { entries: { subject: string; outcome: string; kind: string }[] }): Ladder {
  const rungs = report.rungs ?? [];
  const rules = [...rungs]
    .sort((a, b) => RUNGS.indexOf(a.rung) - RUNGS.indexOf(b.rung) || compareCodePoints(a.item, b.item))
    .map((r) => ({ ...r, outcomes: overview.entries.filter((e) => e.subject === r.item).map((e) => ({ outcome: e.outcome, kind: e.kind })) }));
  return { schema: "csh-ladder/v1", counts: ladderCounts(rungs), rules };
}

/** The ladder as text: one block per rung, weakest first, each rule with why it sits there and what it landed in. */
export function renderLadder(l: Ladder): string {
  if (l.rules.length === 0) return "No told rule was read: the Assertion Ladder grades requirements, rules and properties a source states.\n";
  const out = [ladderLine(l.counts), ""];
  for (const r of RUNGS) {
    const rules = l.rules.filter((x) => x.rung === r);
    if (rules.length === 0) continue;
    out.push(`${r} ${RUNG_NAMES[r]} (${rules.length})`);
    for (const x of rules) {
      const landed = x.outcomes.map((o) => `${o.outcome} ${o.kind}`).join(", ");
      out.push(`  ${x.item}${landed !== "" ? `  [${landed}]` : ""}`);
      if (x.by.length === 0) out.push("    nothing in the repository checks it; a test that cites it would make it L3");
      for (const b of x.by) out.push(`    ${b.rung} ${b.mechanism}`);
    }
    out.push("");
  }
  out.push("A rung counts only what stops a wrong change in the repository itself: its tests, its compiler, and approved obligations.", "");
  return out.join("\n");
}
