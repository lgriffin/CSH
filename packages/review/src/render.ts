// The rendering of a diff (Next layers, section 5.2): what costs the reviewer a decision first, counts last. An empty
// section says "none", so the reader can tell silence from omission. Generated from the diff model alone.
import type { Signal } from "@csh/check";
import type { Observation, RunDiff } from "./diff.ts";

const short = (c: string) => (/^[0-9a-f]{40}/.test(c) ? `${c.slice(0, 12)}${c.endsWith("-dirty") ? "-dirty" : ""}` : c);

export function describeSignal(s: Signal): string {
  const what = s.subject ?? s.fragments.join(", ");
  return `${s.kind}: ${what}${s.subject !== undefined && s.fragments.length > 0 ? ` (${s.fragments.join(", ")})` : ""}`;
}

export function describeObservation(o: Observation): string {
  switch (o.k) {
    case "approval-lost":
      return `approval lost: ${o.fragment} changed and is no longer approved`;
    case "rule-and-evidence-moved-together":
      return `the specification and the evidence of ${o.practices.join(", ")} changed in one change`;
    case "implementation-and-tests-changed-together":
      return "the implementation and its tests changed in one change";
    case "evidence-removed":
      return `tests no longer seen: ${o.tests.join(", ")}`;
    case "spec-untouched":
      return "the specification is untouched";
  }
}

/** Reasons without the bare headline codes that a detailed reason already carries ("binding-not-approved"). */
function detailed(reasons: string[]): string[] {
  return reasons.filter((r) => !reasons.some((o) => o !== r && o.startsWith(`${r}:`)));
}

function section(title: string, lines: string[]): string[] {
  return lines.length === 0 ? [`${title}: none`] : [`${title}:`, ...lines.map((l) => `  - ${l}`)];
}

const side = (s: RunDiff["base"]) => ("unavailable" in s ? "unavailable" : short(s.commit));

export function renderDiff(d: RunDiff): string {
  const out: string[] = [];
  if (d.comparison !== "made") {
    const missing = d.comparison === "base-unavailable" ? d.base : d.head;
    const why = "unavailable" in missing ? missing.unavailable : "";
    out.push(`${d.comparison}: ${why}`);
    if (d.alone === undefined) {
      const other = d.comparison === "base-unavailable" ? d.head : d.base;
      out.push(`Neither side could be run, so the comparison was not made${"unavailable" in other ? ` (the other: ${other.unavailable})` : ""}. This is not an empty diff.`);
      return `${out.join("\n")}\n`;
    }
    out.push(`Only the ${d.alone.side} could be run, so the comparison was not made; it is shown alone below. This is not an empty diff.`);
    out.push("");
    out.push(...section(`Signals at the ${d.alone.side}`, (d.alone?.signals ?? []).map(describeSignal)));
    out.push(...section(`Rules at the ${d.alone.side}`, (d.alone?.obligations ?? []).map((o) => `${o.fragment}: ${o.verdict}, ${o.applicability} (${o.authority})`)));
    out.push("");
    out.push(`Counts: ${d.component}, ${side(d.base)} -> ${side(d.head)}; gate ${d.gate[0]} -> ${d.gate[1]}`);
    return `${out.join("\n")}\n`;
  }
  const lost = d.observations.filter((o): o is Extract<Observation, { k: "approval-lost" }> => o.k === "approval-lost").map((o) => o.fragment);
  out.push(...section("Approvals lost", lost));
  const bad = d.obligations.filter((o) => o.authority[1] === "approved" && (o.verdict[1] === "violated" || o.verdict[1] === "conflicting") && o.verdict[0] !== o.verdict[1]);
  out.push(...section("New violations and conflicts on approved rules", bad.map((o) => `${o.fragment}: ${o.verdict[0]} -> ${o.verdict[1]} (${o.disposition[1]})`)));
  const unknown = d.obligations.filter((o) => (o.verdict[1] === "unknown" && o.verdict[0] !== "unknown") || (o.applicability[1] === "stale" && o.applicability[0] !== "stale"));
  out.push(...section("Rules that became unknown or stale", unknown.map((o) => `${o.fragment}: ${o.verdict[1]}, ${o.applicability[1]}${o.reasons !== undefined ? `: ${detailed(o.reasons).join("; ")}` : ""}`)));
  const covered = new Set(bad.map((o) => o.fragment));
  const fresh = d.signals.appeared.filter((s) => !(s.kind === "violated" && s.fragments.every((f) => covered.has(f))));
  out.push(...section("New signals among candidates", fresh.map(describeSignal)));
  out.push(...section("Signals cleared", d.signals.cleared.map(describeSignal)));
  out.push(...section("Observations", d.observations.filter((o) => o.k !== "approval-lost").map(describeObservation)));
  const moved = d.obligations.filter((o) => o.authority[0] !== o.authority[1]).map((o) => `${o.fragment}: ${o.authority[0]} -> ${o.authority[1]}`);
  if (moved.length > 0) out.push(...section("Authority moved", moved));
  out.push("");
  out.push(
    `Counts: ${d.component}, ${side(d.base)} -> ${side(d.head)}; fragments +${d.fragments.added.length} -${d.fragments.removed.length} ~${d.fragments.changed.length}; ` +
      `rules moved ${d.obligations.length}; signals appeared ${d.signals.appeared.length}, cleared ${d.signals.cleared.length}, persisting ${d.signals.persisting}; ` +
      `tests +${d.evidence.testsAdded.length} -${d.evidence.testsRemoved.length}; gate ${d.gate[0]} -> ${d.gate[1]}`,
  );
  return `${out.join("\n")}\n`;
}
