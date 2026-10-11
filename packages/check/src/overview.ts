// The overview (Ingesting a codebase, stage 27): every result of a report placed in one of three outcomes, each with
// what would move it. Converged is what the evidence bears out. A gap is a suggestion that can be addressed: where,
// what disagrees, and what would close it. Indeterminate is what the tool could not decide, with what would decide it.
// Every signal of the report is an entry, so a sheet built from the overview opens on any signal; a kind no rule
// places is indeterminate, never dropped. The overview reads the report and decides nothing new.
import { compareCodePoints, digestJson } from "@csh/kernel";
import { type PracticeMap, signalsOf } from "./signals.ts";
import type { Report } from "./types.ts";

export type Outcome = "converged" | "gap" | "indeterminate";

export interface OverviewEntry {
  outcome: Outcome;
  kind: string;
  /** The practice that owns the entry's source; "specification" or "history" when no practice does. */
  practice: string;
  subject: string;
  detail?: string;
  /** For a gap, what would close it; for an indeterminate entry, what would decide it; for converged, what holds. */
  next: string;
  /** The signal's id, for every gap and indeterminate entry that is a signal. */
  signal?: string;
  /** The entry's anchor in a sheet: the signal id, or a digest of its kind and subject. */
  anchor: string;
}

export interface Overview {
  schema: "csh-overview/v1";
  counts: Record<Outcome, number>;
  entries: OverviewEntry[];
}

/** Signal kinds that are suggestions, with what would close each. */
export const GAP_NEXT: Record<string, string> = {
  "state-conflict": "Decide which rule holds and change the other, or narrow one so both can hold",
  "joint-conflict": "Decide which rules hold together and change the others, or narrow them",
  "example-conflict": "Decide whether the example or the rule is intended, and change the other",
  "arch-conflict": "Decide whether the diagram or the code is intended, and change the other",
  "claim-conflict": "Two sources disagree about the code: correct the one the code refutes",
  "fact-conflict": "The prose says what the code refutes: correct the sentence, or the code if the sentence is the intent",
  "example-divergence": "Two examples give different outcomes for the same inputs: settle which is intended",
  vacuous: "The rule can never apply: check its condition",
  "not-preserved": "A transition breaks the rule: fix the transition, or relax the rule",
  "not-met": "The obligation is not met: fix what it constrains, or revise it",
  violated: "The evidence violates the obligation: fix the implementation, or revise the obligation",
  "dangling-reference": "Fix or remove the reference to what does not exist",
  unverified: "Name the mechanism that verifies it, or cite its identifier in a test title",
  "status-unsupported": "Point the stated status at a mechanism the repository holds, or lower the status",
  "stale-prose": "Re-read each line against the file changed since it was written, and update it",
  "untraced-change": "Add a test with the change, or a Refs: trailer naming what it implements",
  "failing-test": "Fix the failing tests, or what they test",
  uncited: "Cite the item from a rule, or retire it",
  unbound: "Bind the term to the code, or drop it",
  "no-example": "Add an example that exercises the rule",
  "no-rule": "Add the rule the example illustrates",
  "single-source": "Corroborate it from a second source",
  "undrawn-dependency": "Draw the dependency, or remove it from the code",
  "unobserved-relation": "Remove the drawn relation, or add the code it describes",
  "unplaced-package": "Place the package in a container of the diagram",
  "unowned-source": "Name the practice that owns the source",
  unliftable: "Rewrite the content in a form its adapter reads, or move it out of the source",
};

/** Signal kinds the tool could not decide, with what would decide each. Any other kind is indeterminate too. */
export const INDETERMINATE_NEXT: Record<string, string> = {
  unknown: "Give the solver a larger budget, or narrow the rule",
  "not-comparable": "Align the units or types so the two can be compared",
  "outcome-unknown": "Record the test's outcome in an execution line",
  "unobserved-test": "Record a witness from the test, or stop joining its executions",
  relaxed: "A person relaxed this obligation: confirm the relaxation still holds",
  reserved: "The term is reserved: bind it or remove it once its meaning is settled",
  "unconstrained-after": "Say what the event leaves unchanged",
};
const OTHER_NEXT = "No rule places this kind yet: read its detail";

/** Where an entry with no practice comes from: a commit of history, or the specification's own intents. */
const placeOf = (kind: string) => (kind === "untraced-change" ? "history" : "specification");

const anchorOf = (kind: string, subject: string) => `x-${digestJson({ kind, subject }).slice(7, 23)}`;

/** The overview of one report. The practice of each source comes from the manifest when given, else the report's. */
export function overviewOf(report: Report, manifest?: PracticeMap): Overview {
  const practiceOf = manifest?.sources ?? report.component?.sources ?? {};
  const entries: OverviewEntry[] = [];
  const signals = signalsOf(report, manifest);
  // A violated obligation that a finding already names is one suggestion, not two: the finding says why.
  const inFindings = new Set(signals.filter((s) => s.kind !== "violated" && report.findings.some((f) => f.id === s.id)).flatMap((s) => s.fragments));
  for (const s of signals) {
    if (s.kind === "violated" && s.fragments.every((f) => inFindings.has(f))) continue;
    const gap = GAP_NEXT[s.kind];
    const subject = s.subject ?? (s.fragments.length > 0 ? s.fragments.join(", ") : s.kind);
    entries.push({
      outcome: gap !== undefined ? "gap" : "indeterminate",
      kind: s.kind,
      practice: s.practices[0] ?? placeOf(s.kind),
      subject,
      ...(s.detail !== undefined && s.detail !== "" ? { detail: s.detail } : {}),
      next: gap ?? INDETERMINATE_NEXT[s.kind] ?? OTHER_NEXT,
      signal: s.id,
      anchor: s.id,
    });
  }
  // Obligations: satisfied converge; unknown ones are indeterminate (a violated one is already a signal above).
  for (const a of report.assessments ?? []) {
    const practice = practiceOf[a.source] ?? "specification";
    if (a.verdict === "satisfied") entries.push({ outcome: "converged", kind: "satisfied", practice, subject: a.fragment, next: "The evidence bears the obligation out", anchor: anchorOf("satisfied", a.fragment) });
    else if (a.verdict === "unknown") entries.push({ outcome: "indeterminate", kind: "unknown-obligation", practice, subject: a.fragment, ...(a.reasons.length > 0 ? { detail: a.reasons.join("; ") } : {}), next: "Supply the evidence its reasons name, or approve what it waits on", anchor: anchorOf("unknown-obligation", a.fragment) });
  }
  // Test results (stage 26): a cited item whose every run test passed converges; a test file that ran nothing it
  // declares stays indeterminate, counted per source.
  const testFiles = new Set(report.items.filter((i) => i.kind === "test-file").map((i) => `${i.source}/${i.id}`));
  for (const o of report.outcomes ?? []) {
    if (testFiles.has(o.item) || o.failed + o.errored > 0 || o.passed === 0) continue;
    const source = o.item.split("/")[0]!;
    entries.push({ outcome: "converged", kind: "tested", practice: practiceOf[source] ?? "-", subject: o.item, detail: `${o.passed} passing test${o.passed === 1 ? "" : "s"} cite it${o.skipped > 0 ? `, ${o.skipped} skipped` : ""}`, next: "Tests that name it pass", anchor: anchorOf("tested", o.item) });
  }
  // What an item's "verified by" names as test files (stage 27): converged when every named file ran and passed;
  // indeterminate when one reported nothing, since the runner was never asked about it. A failure is a failing-test gap.
  for (const v of report.verifiedBy ?? []) {
    const source = v.item.split("/")[0]!;
    const practice = practiceOf[source] ?? "-";
    const named = `${v.files} test file${v.files === 1 ? "" : "s"} its Verified by names`;
    if (v.unreported > 0) entries.push({ outcome: "indeterminate", kind: "verified-by-unreported", practice, subject: v.item, detail: `${v.unreported} of ${named} reported no result`, next: "Run the test files its Verified by names and name their results file", anchor: anchorOf("verified-by-unreported", v.item) });
    else if (v.failed + v.errored === 0 && v.passed > 0) entries.push({ outcome: "converged", kind: "verified-by-tests", practice, subject: v.item, detail: `${v.passed} passing tests in ${named}; none names it`, next: "The tests it names pass; cite its identifier in their titles to say which test checks it", anchor: anchorOf("verified-by-tests", v.item) });
  }
  // A source's test files converge together only when every one that reported passed: a failing file is its own
  // failing-test gap, and a source with one never reads as converged.
  const perSource = new Map<string, { files: number; tests: number; failing: number }>();
  for (const o of report.outcomes ?? []) {
    if (!testFiles.has(o.item)) continue;
    const source = o.item.split("/")[0]!;
    const c = perSource.get(source) ?? { files: 0, tests: 0, failing: 0 };
    if (o.failed + o.errored > 0) c.failing++;
    else if (o.passed > 0) {
      c.files++;
      c.tests += o.passed;
    }
    perSource.set(source, c);
  }
  for (const [source, c] of perSource) {
    if (c.files === 0 || c.failing > 0) continue;
    entries.push({ outcome: "converged", kind: "tests-pass", practice: practiceOf[source] ?? "-", subject: source, detail: `${c.tests} tests in ${c.files} test files pass`, next: "Every test the runner reported for these files passed", anchor: anchorOf("tests-pass", source) });
  }
  for (const d of report.diagnostics) {
    if (d.code !== "results-missing" && d.code !== "no-results") continue;
    entries.push({ outcome: "indeterminate", kind: d.code, practice: practiceOf[d.source] ?? "-", subject: d.source, detail: d.message, next: "Run the tests these files hold and name their results file", anchor: anchorOf(d.code, d.source) });
  }
  const order: Outcome[] = ["gap", "indeterminate", "converged"];
  entries.sort((a, b) => order.indexOf(a.outcome) - order.indexOf(b.outcome) || compareCodePoints(a.practice, b.practice) || compareCodePoints(a.kind, b.kind) || compareCodePoints(a.subject, b.subject));
  const counts = { converged: 0, gap: 0, indeterminate: 0 };
  for (const e of entries) counts[e.outcome]++;
  return { schema: "csh-overview/v1", counts, entries };
}

const TITLES: Record<Outcome, string> = { gap: "Gaps: suggestions to address", indeterminate: "Indeterminate: what could not be decided", converged: "Converged: what the evidence bears out" };

/** Groups of an outcome's entries, by practice and kind, in entry order. */
function groups(entries: OverviewEntry[]): { practice: string; kinds: { kind: string; next: string; entries: OverviewEntry[] }[] }[] {
  const out: ReturnType<typeof groups> = [];
  for (const e of entries) {
    let p = out.find((x) => x.practice === e.practice);
    if (p === undefined) out.push((p = { practice: e.practice, kinds: [] }));
    let k = p.kinds.find((x) => x.kind === e.kind);
    if (k === undefined) p.kinds.push((k = { kind: e.kind, next: e.next, entries: [] }));
    k.entries.push(e);
  }
  return out;
}

/** The overview as text: counts by outcome, then by practice and kind, each kind with what would move it. */
export function renderOverview(o: Overview): string {
  const out = [`CSH overview: ${o.counts.gap} gaps, ${o.counts.indeterminate} indeterminate, ${o.counts.converged} converged`, ""];
  for (const outcome of ["gap", "indeterminate", "converged"] as Outcome[]) {
    const es = o.entries.filter((e) => e.outcome === outcome);
    if (es.length === 0) continue;
    out.push(`== ${TITLES[outcome]} (${es.length})`, "");
    for (const p of groups(es)) {
      out.push(`  ${p.practice}`);
      for (const k of p.kinds) out.push(`    ${String(k.entries.length).padStart(4)}  ${k.kind}: ${k.next}`);
    }
    out.push("");
  }
  out.push("csh overview --signal <id> prints one entry; the sheet is reports/csh-overview.html.", "");
  return out.join("\n");
}

/** One entry as text, its detail one part per line. */
export function renderEntry(e: OverviewEntry): string {
  const lines = [`${e.outcome} ${e.kind}  ${e.subject}`, `  practice ${e.practice}${e.signal !== undefined ? `; signal ${e.signal}` : ""}`];
  for (const part of (e.detail ?? "").split(/;\s+/).filter((x) => x !== "")) lines.push(`  - ${part}`);
  lines.push(`  next: ${e.next}`, "");
  return lines.join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The overview as one self-contained HTML sheet. Each outcome, practice and kind is a section that opens on demand;
 * each entry has its anchor as id, and opening the sheet at `#<anchor>` opens every section around it.
 */
export function renderOverviewHtml(o: Overview, title: string): string {
  const body: string[] = [];
  body.push(`<header><h1>${esc(title)}</h1><div class="tiles">${(["gap", "indeterminate", "converged"] as Outcome[]).map((x) => `<a class="tile ${x}" href="#${x}"><b>${o.counts[x]}</b><span>${x === "gap" ? "gaps" : x}</span></a>`).join("")}</div></header>`);
  for (const outcome of ["gap", "indeterminate", "converged"] as Outcome[]) {
    const es = o.entries.filter((e) => e.outcome === outcome);
    body.push(`<details class="outcome ${outcome}" id="${outcome}"${outcome === "gap" ? " open" : ""}><summary><h2>${esc(TITLES[outcome])} <small>${es.length}</small></h2></summary>`);
    if (es.length === 0) body.push(`<p class="none">None.</p>`);
    for (const p of groups(es)) {
      body.push(`<details class="practice"><summary><h3>${esc(p.practice)} <small>${p.kinds.reduce((n, k) => n + k.entries.length, 0)}</small></h3></summary>`);
      for (const k of p.kinds) {
        body.push(`<details class="kind"><summary><code>${esc(k.kind)}</code> <small>${k.entries.length}</small> <span class="next">${esc(k.next)}</span></summary><ul>`);
        for (const e of k.entries) {
          const parts = (e.detail ?? "").split(/;\s+/).filter((x) => x !== "");
          body.push(`<li id="${esc(e.anchor)}"><div class="subject">${esc(e.subject)}${e.signal !== undefined ? ` <a class="sig" href="#${esc(e.anchor)}">${esc(e.signal)}</a>` : ""}</div>${parts.length > 0 ? `<ul class="detail">${parts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</li>`);
        }
        body.push(`</ul></details>`);
      }
      body.push(`</details>`);
    }
    body.push(`</details>`);
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
:root{--bg:#fbfaf7;--fg:#1d1c1a;--muted:#6b6862;--line:#e3e0d8;--gap:#b4472e;--ind:#a07a1c;--conv:#3c7a4a;--hl:#fff3c4}
@media (prefers-color-scheme: dark){:root{--bg:#1b1a18;--fg:#ece9e2;--muted:#a19d95;--line:#3a3833;--gap:#e07a5f;--ind:#d9b04e;--conv:#7fbf8e;--hl:#4a4126}}
body{margin:0 auto;max-width:72rem;padding:1rem;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}
h1{font-size:1.4rem;margin:.5rem 0 1rem}h2,h3{display:inline;font-size:1.1rem;margin:0}h3{font-size:1rem}
small{color:var(--muted);font-weight:normal}summary{cursor:pointer;padding:.35rem 0}details{border-top:1px solid var(--line)}
details details{margin-left:1rem}.tiles{display:flex;gap:.75rem;flex-wrap:wrap}
.tile{flex:1 1 8rem;border:1px solid var(--line);border-radius:6px;padding:.6rem .8rem;text-decoration:none;color:inherit}
.tile b{display:block;font-size:1.6rem}.tile.gap b{color:var(--gap)}.tile.indeterminate b{color:var(--ind)}.tile.converged b{color:var(--conv)}
.outcome.gap>summary h2{color:var(--gap)}.outcome.indeterminate>summary h2{color:var(--ind)}.outcome.converged>summary h2{color:var(--conv)}
.next{color:var(--muted)}ul{margin:.25rem 0 .75rem;padding-left:1.25rem}li{margin:.2rem 0;overflow-wrap:anywhere}
.subject{font-family:ui-monospace,monospace;font-size:.9em}.sig{color:var(--muted);font-size:.85em}.detail{color:var(--muted);font-size:.9em}
li:target{background:var(--hl);border-radius:4px}
</style></head><body>
${body.join("\n")}
<script>
function openTarget(){var id=decodeURIComponent(location.hash.slice(1));var el=id&&document.getElementById(id);for(var n=el;n;n=n.parentElement)if(n.tagName==="DETAILS")n.open=true;if(el)el.scrollIntoView({block:"center"});}
addEventListener("hashchange",openTarget);openTarget();
</script>
</body></html>
`;
}
