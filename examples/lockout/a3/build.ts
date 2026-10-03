// Build the lockout A3 from the harness's own output (docs/lockout-a3.md is its output).
//
//   node examples/lockout/a3/build.ts --stages <dir> --out <dir>
//
// Two inputs. The reports: <dir>/<stage>/report.json and gate.json, one directory per stage of the walkthrough.
// The judgments: a3.json beside this file, which holds what only a person can say (the background, the root
// causes, the countermeasures) and the rules that place each signal of a report on the sheet. Every number on the
// sheet is counted from the reports; nothing numeric is written by hand. A signal no rule places is shown as
// unclassified, so a change to the harness or the example that adds a new kind of signal shows up on the sheet.
//
// Output: lockout-a3.html (one self-contained page; a stage picker shows each stage) and lockout-a3.md. The output
// depends only on the inputs, never on the clock or commit hashes, so CI can compare it with the committed copy.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

interface Match { kind: string; any?: string; not?: string }
interface Judgments {
  title: string;
  problem: string;
  stages: { id: string; name: string; what: string }[];
  background: string[];
  practices: { id: string; name: string; artefact: string; author: string; unit: string; judgedBy: string; inCsh: string; cannotSay: string }[];
  lanes: { id: string; lane: string; step: number; title: string[]; where: string; match: Match[] }[];
  causes: { id: string; name: string; match: Match[] }[];
  decisionPoints: { point: string; class: string; ears: [string, string]; bdd: [string, string]; tdd: [string, string]; note?: string; match: Match[] }[];
  rca: { q: string; a: string; evidence?: string; depth: string; deep?: boolean }[];
  whys: { q: string; a: string; root?: string }[];
  countermeasures: { id: string; kind: string; what: string; answers: string; clears?: Match[]; stage?: string }[];
  plan: [string, string, string][];
  terms: [string, string][];
}

interface Signal { kind: string; label: string; text: string }

interface Stage {
  id: string;
  name: string;
  what: string;
  signals: Signal[];
  tests: { passed: number; total: number };
  gate: { mode: string; overall: string };
  rules: { name: string; verdict: string; authority: string; selfApproved: boolean; disposition: string }[];
}

const short = (fragment: string) => fragment.split("/").pop() ?? fragment;

/** Every signal of one report: findings, not comparable, errors and warnings, gaps, and violated rules. */
export function signalsOf(report: any): Signal[] {
  const out: Signal[] = [];
  for (const f of report.findings ?? []) {
    const names: string[] = f.members.map((m: any) => m.fragment);
    out.push({ kind: f.kind, label: `${f.kind} ${f.id}: ${names.map(short).join(" × ")}`, text: [f.query ?? "", ...names].join(" ") });
  }
  for (const n of report.notComparable ?? []) out.push({ kind: "not-comparable", label: `not comparable: ${short(n.fragment)} (${n.reason})`, text: `${n.fragment} ${n.reason} ${n.source}` });
  for (const e of report.errors ?? []) out.push({ kind: e.code, label: `${e.code}: ${e.detail}`, text: `${e.detail} ${e.fragment ?? ""} ${e.source ?? ""}` });
  for (const g of report.gapView?.gaps ?? []) out.push({ kind: g.kind, label: `${g.kind}: ${short(g.subject)}${g.kind === "unliftable" ? ` (${g.detail.split(": ").pop()})` : ""}`, text: `${g.subject} ${g.detail ?? ""} ${(g.fragments ?? []).join(" ")}` });
  for (const a of report.assessments ?? []) if (a.verdict === "violated") out.push({ kind: "violated", label: `violated: ${short(a.fragment)} (${a.authority})`, text: a.fragment });
  return out.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

export function matches(s: Signal, m: Match): boolean {
  return s.kind === m.kind && (m.any === undefined || s.text.includes(m.any)) && (m.not === undefined || !s.text.includes(m.not));
}
const matchesAny = (s: Signal, ms: Match[]) => ms.some((m) => matches(s, m));

function loadStage(dir: string, j: Judgments["stages"][number]): Stage {
  const report = JSON.parse(readFileSync(join(dir, j.id, "report.json"), "utf8"));
  const gate = JSON.parse(readFileSync(join(dir, j.id, "gate.json"), "utf8"));
  const execs: any[] = report.executions ?? [];
  const disposition = new Map<string, string>((gate.obligations ?? []).map((o: any) => [o.fragment, o.disposition]));
  return {
    ...j,
    signals: signalsOf(report),
    tests: { passed: execs.filter((e) => e.localResult === "passed").length, total: execs.length },
    gate: { mode: gate.mode, overall: gate.overall },
    rules: (report.assessments ?? []).map((a: any) => ({ name: short(a.fragment), verdict: a.verdict, authority: a.authority, selfApproved: a.selfApproved === true, disposition: disposition.get(a.fragment) ?? "candidate" })),
  };
}

// ------------------------------------------------------------------ what the sheet counts

interface Bar { name: string; n: number; cumulative: number; vital: boolean }

export function pareto(signals: Signal[], causes: Judgments["causes"]): Bar[] {
  const counts = causes.map((c) => ({ name: c.name, n: signals.filter((s) => causes.find((x) => matchesAny(s, x.match)) === c).length }));
  const unclassified = signals.filter((s) => !causes.some((c) => matchesAny(s, c.match))).length;
  if (unclassified > 0) counts.push({ name: "Unclassified: no rule in a3.json places it", n: unclassified });
  const sorted = counts.filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
  const total = sorted.reduce((t, c) => t + c.n, 0);
  let run = 0;
  let crossed = false;
  return sorted.map((c) => {
    const vital = !crossed;
    run += c.n;
    if (run / total >= 0.8) crossed = true;
    return { name: c.name, n: c.n, cumulative: run / total, vital };
  });
}

const laneCount = (st: Stage, lane: Judgments["lanes"][number], all: Judgments["lanes"]) => st.signals.filter((s) => all.find((l) => matchesAny(s, l.match)) === lane).length;
const disputed = (st: Stage, j: Judgments) => j.decisionPoints.filter((d) => st.signals.some((s) => matchesAny(s, d.match)));
const conflicts = (st: Stage) => st.signals.filter((s) => s.kind.endsWith("-conflict")).length;

interface Measure { name: string; target: string; value: (st: Stage, j: Judgments) => string; met: (st: Stage, j: Judgments) => boolean }
const MEASURES: Measure[] = [
  { name: "Conflicts between claims", target: "0", value: (st) => String(conflicts(st)), met: (st) => conflicts(st) === 0 },
  { name: "Not comparable", target: "0", value: (st) => String(st.signals.filter((s) => s.kind === "not-comparable").length), met: (st) => !st.signals.some((s) => s.kind === "not-comparable") },
  { name: "Shape mismatches and dangling citations", target: "0", value: (st) => String(st.signals.filter((s) => s.kind === "shape-mismatch" || s.kind === "dangling-citation").length), met: (st) => !st.signals.some((s) => s.kind === "shape-mismatch" || s.kind === "dangling-citation") },
  { name: "Examples with no rule", target: "0", value: (st) => String(st.signals.filter((s) => s.kind === "no-rule").length), met: (st) => !st.signals.some((s) => s.kind === "no-rule") },
  { name: "Silences without an owner decision", target: "0", value: (st, j) => String(disputed(st, j).filter((d) => d.class === "silence").length), met: (st, j) => !disputed(st, j).some((d) => d.class === "silence") },
  { name: "Rules satisfied on approved evidence", target: "all", value: (st) => `${st.rules.filter((r) => r.verdict === "satisfied" && r.authority === "approved").length} of ${st.rules.length}`, met: (st) => st.rules.length > 0 && st.rules.every((r) => r.verdict === "satisfied" && r.authority === "approved") },
  { name: "Enforcing gate allows", target: "allow", value: (st) => (st.gate.mode === "enforcing" ? st.gate.overall : `${st.gate.overall} (advisory)`), met: (st) => st.gate.mode === "enforcing" && st.gate.overall === "allow" },
];

function status(cm: Judgments["countermeasures"][number], stages: Stage[]): string {
  const before = stages[0]!;
  const after = stages[1]!;
  if (cm.stage !== undefined) {
    const st = stages.find((s) => s.id === cm.stage);
    return st !== undefined && st.gate.mode === "enforcing" && st.gate.overall === "allow" ? "verified" : "proposed";
  }
  if (cm.clears === undefined) return cm.kind === "scope" ? "owner decides" : "proposed";
  const had = before.signals.some((s) => matchesAny(s, cm.clears!));
  const has = after.signals.some((s) => matchesAny(s, cm.clears!));
  return had && !has ? "verified" : had ? "not cleared" : "nothing to clear";
}

// ------------------------------------------------------------------ HTML

const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const code = (s: string) => esc(s).replace(/\b(src\/[\w./]+|packages\/[\w./]+|features\/[\w./]+|docs\/[\w./]+|csh check|while|and|@LOCK-3|@LCK-003|MAX_FAILED_ATTEMPTS = 3 with &gt;|failedAttempts &gt; MAX_FAILED_ATTEMPTS)\b/g, (m) => (/^(while|and)$/.test(m) ? m : `<code>${m}</code>`));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const tag = (p: string) => `<span class="tag ${p}">${p.toUpperCase()}</span>`;
const stageAttr = (st: Stage, first: boolean) => `data-stage="${st.id}"${first ? "" : " hidden"}`;

function tiles(st: Stage, j: Judgments, first: boolean): string {
  const counts = new Map<string, number>();
  for (const s of st.signals) {
    const k = s.kind.endsWith("-conflict") ? "conflicts" : s.kind === "not-comparable" ? "not comparable" : ["shape-mismatch", "dangling-citation"].includes(s.kind) ? "errors and warnings" : s.kind === "violated" ? "violated" : "gaps";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const breakdown = ["conflicts", "violated", "not comparable", "errors and warnings", "gaps"].filter((k) => counts.has(k)).map((k) => `${counts.get(k)} ${k}`).join(", ");
  const dp = disputed(st, j);
  const byClass = ["contradiction", "drift", "silence"].map((c) => `${dp.filter((d) => d.class === c).length} ${c === "contradiction" ? "contradictions" : c === "drift" ? "drifts" : "silences"}`).join(" · ");
  const green = st.tests.passed === st.tests.total;
  const gateTone = st.gate.overall === "block" ? "fail" : st.gate.overall === "allow" && st.gate.mode === "enforcing" ? "pass" : "";
  return `<section class="andon" aria-label="Scoring at stage ${esc(st.name)}" ${stageAttr(st, first)}>
  <div class="tile${green ? " pass" : " fail"}"><span class="k">Each practice alone</span><span class="huge">${green ? "Green" : "Red"}</span><span class="sub">${st.tests.passed} of ${st.tests.total} unit tests pass · scenarios agreed · sentences reviewed</span></div>
  <div class="tile${st.signals.some((s) => s.kind.endsWith("-conflict") || s.kind === "violated") ? " fail" : ""}"><span class="k">Read together by CSH</span><span class="huge">${st.signals.length}</span><span class="sub">signals: ${esc(breakdown || "none")}</span></div>
  <div class="tile"><span class="k">Decision points with a signal</span><span class="huge">${dp.length}</span><span class="sub">${byClass}</span></div>
  <div class="tile${gateTone ? ` ${gateTone}` : ""}"><span class="k">Gate · ${esc(st.gate.mode)}</span><span class="huge">${esc(st.gate.overall)}</span><span class="sub">${st.rules.filter((r) => r.authority === "approved").length} of ${st.rules.length} rules approved${st.rules.some((r) => r.selfApproved) ? ", self-approved" : ""}</span></div>
</section>`;
}

function lanesSvg(st: Stage, j: Judgments, first: boolean): string {
  const y: Record<string, number> = { ears: 22, bdd: 127, tdd: 232 };
  const x: Record<number, number> = { 1: 176, 2: 386 };
  const parts: string[] = [];
  const andon = (cx: number, cy: number, n: number) => (n === 0 ? "" : `<g class="andon"><rect x="${cx}" y="${cy}" width="40" height="20" rx="4"/><text x="${cx + 20}" y="${cy + 14}" text-anchor="middle">${n}</text></g>`);
  for (const l of j.lanes) {
    const n = laneCount(st, l, j.lanes);
    if (l.lane === "hub") {
      parts.push(`<rect x="680" y="115" width="190" height="90" rx="8" class="hub"/><text x="690" y="140">${esc(l.title[0]!)}</text><text x="690" y="158" class="small">rules from EARS only,</text><text x="690" y="172" class="small">examples from BDD and TDD</text><text x="690" y="190" class="small">first place the three meet</text>${andon(840, 105, n)}`);
      continue;
    }
    const bx = x[l.step]!;
    const by = y[l.lane]!;
    const w = l.step === 1 ? 170 : 190;
    parts.push(`<rect x="${bx}" y="${by}" width="${w}" height="66" rx="6" class="box"/><text x="${bx + 10}" y="${by + 22}">${esc(l.title[0]!)}</text><text x="${bx + 10}" y="${by + 40}">${esc(l.title[1] ?? "")}</text><text x="${bx + 10}" y="${by + 56}" class="small">${esc(l.where)}</text>${andon(bx + w - 26, by - 10, n)}`);
  }
  const placed = st.signals.filter((s) => j.lanes.some((l) => matchesAny(s, l.match))).length;
  return `<div class="scroll" ${stageAttr(st, first)}><svg class="lanes" viewBox="0 0 960 330" role="img" aria-label="One user story is translated three times in parallel, into EARS sentences, BDD scenarios and unit tests, which meet only in the harness or the running code. At stage ${esc(st.name)}, ${placed} signals are placed on the hand-offs.">
  <defs><marker id="ah-${st.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 Z" class="head"/></marker></defs>
  <rect x="10" y="125" width="120" height="70" rx="8" class="story"/><text x="70" y="155" text-anchor="middle">User story</text><text x="70" y="172" text-anchor="middle" class="small">"three failed</text><text x="70" y="185" text-anchor="middle" class="small">attempts lock it"</text>
  <rect x="160" y="22" width="6" height="66" class="lane-ears"/><rect x="160" y="127" width="6" height="66" class="lane-bdd"/><rect x="160" y="232" width="6" height="66" class="lane-tdd"/>
  ${["M130 145 C145 145 145 55 172 55", "M130 160 L172 160", "M130 175 C145 175 145 265 172 265", "M346 55 L382 55", "M346 160 L382 160", "M346 265 L382 265", "M576 55 C640 55 640 145 676 150", "M576 160 L676 160", "M576 265 C640 265 640 175 676 170"].map((d) => `<path d="${d}" class="arrow" marker-end="url(#ah-${st.id})"/>`).join("")}
  ${parts.join("\n  ")}
  <text x="680" y="240" class="small">Without the harness, the only place</text><text x="680" y="254" class="small">they meet is the running code.</text>
</svg></div>`;
}

function decisionTable(st: Stage, j: Judgments, first: boolean): string {
  const cell = ([tone, text]: [string, string]) => `<span class="cell ${tone}">${code(text)}</span>`;
  const rows = j.decisionPoints.map((d) => {
    const hits = st.signals.filter((s) => matchesAny(s, d.match));
    const harness = hits.length === 0 ? `<span class="none">no signal at this stage</span>` : `${hits.map((s) => esc(s.label)).join("<br>")}${d.note ? `<br><span class="src">${esc(d.note)}</span>` : ""}`;
    return `<tr><td>${esc(d.point)}</td><td>${cell(d.ears)}</td><td>${cell(d.bdd)}</td><td>${cell(d.tdd)}</td><td>${harness}</td><td><span class="chip ${d.class}">${d.class}</span></td></tr>`;
  });
  return `<div class="scroll" ${stageAttr(st, first)}><table><thead><tr><th>Decision point</th><th>${tag("ears")}</th><th>${tag("bdd")}</th><th>${tag("tdd")}</th><th>CSH reports at ${esc(st.name.toLowerCase())}</th><th>Class</th></tr></thead><tbody>
${rows.join("\n")}
</tbody></table><p class="src">The practice columns are what the original artefacts say. The CSH column is read from this stage's report.</p></div>`;
}

function paretoHtml(st: Stage, j: Judgments, first: boolean): string {
  const bars = pareto(st.signals, j.causes);
  if (bars.length === 0) return `<figure class="pareto" ${stageAttr(st, first)}><figcaption><strong>Pareto: signals by cause</strong></figcaption><p class="none">No signals at this stage.</p></figure>`;
  const max = Math.max(...bars.map((b) => b.n));
  const total = bars.reduce((t, b) => t + b.n, 0);
  const cut = bars.findIndex((b) => !b.vital);
  const rows = bars.map((b, i) => `${i === cut ? `<li class="cut" aria-hidden="true"><span>80% crossed: the vital few above, the useful many below</span></li>` : ""}<li class="${b.vital ? "vital" : ""}"><span class="pl">${esc(b.name)}</span><span class="pb"><span class="bar" style="width:${((b.n / max) * 100).toFixed(1)}%"></span></span><span class="pv">${b.n}</span><span class="pc">${pct(b.cumulative)}</span></li>`);
  return `<figure class="pareto" ${stageAttr(st, first)}><figcaption><strong>Pareto: the ${total} signals by cause</strong><span class="src">every signal of the ${esc(st.name.toLowerCase())} report, placed by the cause rules in a3.json</span></figcaption>
<div class="phead" aria-hidden="true"><span></span><span></span><span>n</span><span>cum.</span></div>
<ol class="bars">${rows.join("")}</ol></figure>`;
}

function rulesTable(st: Stage, first: boolean): string {
  return `<div class="scroll" ${stageAttr(st, first)}><table><thead><tr><th>Rule</th><th>Authority</th><th>Verdict</th><th>Gate</th></tr></thead><tbody>${st.rules.map((r) => `<tr><td><code>${esc(r.name)}</code></td><td>${esc(r.authority)}${r.selfApproved ? ", self-approved" : ""}</td><td><span class="verdict ${esc(r.verdict)}">${esc(r.verdict)}</span></td><td>${r.disposition === "candidate" ? `<span class="none">candidate, never blocks</span>` : `<span class="verdict ${esc(r.disposition)}">${esc(r.disposition)}</span>`}</td></tr>`).join("")}</tbody></table></div>`;
}

function signalList(st: Stage, first: boolean): string {
  return `<details ${stageAttr(st, first)}><summary>Every signal at ${esc(st.name.toLowerCase())} (${st.signals.length})</summary><div class="scroll"><table><thead><tr><th>Kind</th><th>Signal</th></tr></thead><tbody>${st.signals.map((s) => `<tr><td><code>${esc(s.kind)}</code></td><td>${esc(s.label)}</td></tr>`).join("") || `<tr><td colspan="2" class="none">none</td></tr>`}</tbody></table></div></details>`;
}

export function html(j: Judgments, stages: Stage[]): string {
  const css = readFileSync(join(HERE, "a3.css"), "utf8");
  const each = (f: (st: Stage, first: boolean) => string) => stages.map((st, i) => f(st, i === 0)).join("\n");
  const picker = `<fieldset class="stages" aria-label="Stage"><span class="k">Stage</span>${stages.map((st, i) => `<label><input type="radio" name="stage" value="${st.id}" id="stage-${st.id}"${i === 0 ? " checked" : ""}>${esc(st.name)}</label>`).join("")}</fieldset>
${stages.map((st, i) => `<p class="stage-what" ${stageAttr(st, i === 0)}>${esc(st.what)}</p>`).join("\n")}`;
  const timeline = `<div class="timeline">${stages.map((st) => `<div><span class="sn">${esc(st.name)}</span><br><span class="sv">${st.tests.passed} of ${st.tests.total} tests pass · ${st.signals.length} signals · ${conflicts(st)} conflicts${st.signals.some((s) => s.kind === "violated") ? " · a rule violated" : ""}</span><br><span class="verdict ${esc(st.gate.overall)}">${esc(st.gate.overall)}</span> <span class="sv">${esc(st.gate.mode)} gate</span></div>`).join("")}</div>`;
  const goal = `<div class="scroll"><table><thead><tr><th>Measure</th><th class="num">Target</th>${stages.map((st, i) => `<th class="num" title="${esc(st.name)}">${i + 1}</th>`).join("")}</tr></thead><tbody>${MEASURES.map((m) => `<tr><td>${esc(m.name)}</td><td class="num">${esc(m.target)}</td>${stages.map((st) => `<td class="num">${esc(m.value(st, j))} ${m.met(st, j) ? `<span class="ok">✓</span>` : `<span class="no">·</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
<p class="src">Stages: ${stages.map((st, i) => `${i + 1} ${esc(st.name.toLowerCase())}`).join(", ")}. ✓ meets the target at that stage. Every value is counted from that stage's report and gate decision.</p>`;
  const compare = `<div class="compare">${j.practices.map((p) => `<div><h4>${tag(p.id)} ${esc(p.artefact)}</h4><dl><dt>Author</dt><dd>${esc(p.author)}</dd><dt>Unit of truth</dt><dd>${esc(p.unit)}</dd><dt>Judged by</dt><dd>${esc(p.judgedBy)}</dd><dt>In CSH</dt><dd>${esc(p.inCsh)}</dd><dt>Cannot say</dt><dd>${esc(p.cannotSay)}</dd></dl></div>`).join("")}</div>`;
  const rca = `<ol class="rcas">${j.rca.map((q, i) => `<li class="rca"><span class="qn">Q${i + 1}</span><div><p class="q">${esc(q.q)}</p><p>${code(q.a)}</p>${q.evidence ? `<p class="src">${code(q.evidence)}</p>` : ""}<span class="depth${q.deep ? " deep" : ""}">${esc(q.depth)}</span></div></li>`).join("")}</ol>`;
  const statusClass = (s: string) => (s === "verified" ? "done" : s === "owner decides" ? "decide" : "proposed");
  const cms = `<div class="scroll"><table><thead><tr><th>#</th><th>Kind</th><th>Countermeasure</th><th>Answers</th><th>Status</th></tr></thead><tbody>${j.countermeasures.map((c) => { const s = status(c, stages); return `<tr><td>${c.id}</td><td><span class="kind">${esc(c.kind)}</span></td><td>${code(c.what)}</td><td>${esc(c.answers)}</td><td><span class="status ${statusClass(s)}">${esc(s)}</span></td></tr>`; }).join("")}</tbody></table></div>
<p class="note">A status of verified is computed: the signals the countermeasure clears are in the first report and gone from the second, or the stage it names ends with the enforcing gate allowing. C7 and C8 change the harness and are not built.</p>`;
  const plan = `<div class="scroll"><table><thead><tr><th>What</th><th>Who</th><th>When</th></tr></thead><tbody>${j.plan.map(([a, b, c]) => `<tr><td>${code(a)}</td><td>${esc(b)}</td><td>${code(c)}</td></tr>`).join("")}</tbody></table></div>`;
  const whys = `<ol class="chain">${j.whys.map((w, i) => `<li${w.root ? ` class="root"` : ""}><span class="wn">Why ${i + 1}</span><div><p class="q">${esc(w.q)}</p><p>${code(w.a)}</p>${w.root ? `<p class="rootcause">${esc(w.root)}</p>` : ""}</div></li>`).join("")}</ol>`;
  const script = `<script>
(function () {
  var pick = function (id) {
    document.querySelectorAll("[data-stage]").forEach(function (el) { el.hidden = el.getAttribute("data-stage") !== id; });
    try { localStorage.setItem("lockout-a3-stage", id); } catch (e) {}
  };
  document.querySelectorAll('input[name="stage"]').forEach(function (r) { r.addEventListener("change", function () { pick(r.value); }); });
  var saved = null;
  try { saved = localStorage.getItem("lockout-a3-stage"); } catch (e) {}
  var input = saved && document.getElementById("stage-" + saved);
  if (input) { input.checked = true; pick(saved); }
})();
</script>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Lockout A3</title>
<style>
${css}</style>
</head><body>
<main class="sheet">
<header class="title"><h1>A3 <span>· ${esc(j.title)}</span></h1><span class="meta">CSH named example <code>examples/lockout</code> · built by <code>examples/lockout/a3/build.ts</code> from the reports of <code>examples/lockout/walkthrough.sh</code> and the judgments in <code>a3/a3.json</code></span></header>
<p class="problem"><strong>Problem.</strong> ${esc(j.problem)}</p>
${picker}
${each((st, f) => tiles(st, j, f))}
<div class="blk wide"><h2>The run, stage by stage <span class="hint">plan, do, check, act, four times over</span></h2>${timeline}</div>

<div class="a3">
<section class="blk"><h2><span class="n">1</span>Background <span class="hint">why this matters</span></h2>${j.background.map((p) => `<p>${esc(p)}</p>`).join("")}${compare}</section>
<section class="blk"><h2><span class="n">3</span>Goal <span class="hint">the target condition, measured at every stage</span></h2>
<p>Every decision point has one rule that all three practices agree with and a person has approved, every translation between notations is visible and reviewed, and every case one practice cannot express is a recorded decision.</p>
${goal}</section>
</div>

<section class="blk wide"><h2><span class="n">2</span>Current condition <span class="hint">go and see: how intent travels from the story to the code, and where it is lost</span></h2>
<figure><figcaption><strong>Three parallel translations of one story</strong><span class="src">each red mark counts the signals placed at that hand-off by the lane rules in a3.json</span></figcaption>
${each((st, f) => lanesSvg(st, j, f))}
<div class="legend"><span><i style="background:var(--ears)"></i>EARS lane</span><span><i style="background:var(--bdd)"></i>BDD lane</span><span><i style="background:var(--tdd)"></i>TDD lane</span><span><i style="background:var(--fail)"></i>signals at that hand-off</span></div>
</figure>
<h3>What each practice says at each decision point</h3>
${each((st, f) => decisionTable(st, j, f))}
<div class="legend"><span><i style="background:var(--soft-pass)"></i>states it</span><span><i style="background:var(--soft-fail)"></i>contradicts another practice</span><span><i style="background:var(--soft-warn)"></i>states it in a form that drifted</span><span><i style="background:var(--soft-mute)"></i>silent</span></div>
${each((st, f) => paretoHtml(st, j, f))}
<p class="note">Counted by frequency, silence leads. Counted by harm, the single off-by-one leads: it is the only signal that ships a behaviour the owner did not ask for.</p>
${each((st, f) => signalList(st, f))}
</section>

<div class="a3">
<section class="blk"><h2><span class="n">4</span>Root cause analysis <span class="hint">each question as deep as the evidence goes</span></h2>${rca}</section>
<div class="col">
<section class="blk"><h2><span class="n">5</span>Countermeasures <span class="hint">to the system, never to a person</span></h2>${cms}</section>
<section class="blk"><h2><span class="n">6</span>Plan <span class="hint">who, what, when</span></h2>${plan}</section>
<section class="blk"><h2><span class="n">7</span>Follow-up <span class="hint">the rules at this stage, as the gate sees them</span></h2>
${each((st, f) => rulesTable(st, f))}
<p class="note">Agreement between the practices is a precondition for a verdict, not a verdict. Rules turn satisfied only with approved bindings, a boundary witness and a solver check against the model.</p></section>
</div>
</div>

<section class="blk wide"><h2><span class="n">4</span>The 5 Whys <span class="hint">for the most harmful signal, the off-by-one, asked until the answer is a process or a tool</span></h2>${whys}</section>
<section class="blk wide terms"><h2>Lean terms on this sheet</h2><dl>${j.terms.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join("")}</dl></section>
<footer>Advisory, like the harness's own report: nothing here approves, waives or decides anything. Approvals in the run are made with a test-only key that the walkthrough creates and deletes.</footer>
</main>
${script}
</body></html>
`;
}

// ------------------------------------------------------------------ Markdown

export function markdown(j: Judgments, stages: Stage[]): string {
  const first = stages[0]!;
  const out: string[] = [];
  const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
  out.push(`# A3: ${j.title.toLowerCase().replace(/^./, (c) => c.toUpperCase())}`, "");
  out.push("This file is generated by `examples/lockout/a3/build.ts` from the reports of `examples/lockout/walkthrough.sh` and the judgments in `examples/lockout/a3/a3.json`. Edit those, not this file. The same sheet as a page, with a picker for each stage, is [lockout-a3.html](lockout-a3.html), and the run itself is [the walkthrough](lockout-walkthrough.md).", "");
  out.push(`**Problem.** ${j.problem}`, "");
  out.push("## The run, stage by stage", "");
  out.push(row(["Stage", "What happens", "Tests", "Signals", "Conflicts", "Rules satisfied", "Gate"]), row(["---", "---", "---:", "---:", "---:", "---:", "---"]));
  for (const st of stages) out.push(row([st.name, st.what, `${st.tests.passed} of ${st.tests.total}`, String(st.signals.length), String(conflicts(st)), `${st.rules.filter((r) => r.verdict === "satisfied").length} of ${st.rules.length}`, `${st.gate.overall} (${st.gate.mode})`]));
  out.push("", "## 1. Background", "", ...j.background, "");
  out.push(row(["", ...j.practices.map((p) => p.name)]), row(["---", ...j.practices.map(() => "---")]));
  for (const [k, label] of [["author", "Author"], ["unit", "Unit of truth"], ["judgedBy", "Judged by"], ["inCsh", "In CSH"], ["cannotSay", "Cannot say"]] as const) out.push(row([label, ...j.practices.map((p) => p[k])]));
  out.push("", "## 2. Current condition", "", `At the first stage, ${first.signals.length} signals. What each practice says at each decision point, and what CSH reports:`, "");
  out.push(row(["Decision point", "EARS", "BDD", "TDD", "CSH reports", "Class"]), row(["---", "---", "---", "---", "---", "---"]));
  for (const d of j.decisionPoints) {
    const hits = first.signals.filter((s) => matchesAny(s, d.match)).map((s) => s.label);
    out.push(row([d.point, d.ears[1], d.bdd[1], d.tdd[1], hits.join("; ") || "no signal", d.class]));
  }
  out.push("", "Where the signals were injected:", "");
  for (const l of j.lanes) out.push(`- ${l.title.join(" ")} (\`${l.where}\`): ${laneCount(first, l, j.lanes)}`);
  out.push("", "Pareto of the signals by cause:", "", row(["Cause", "n", "Cumulative", "Vital few"]), row(["---", "---:", "---:", "---"]));
  for (const b of pareto(first.signals, j.causes)) out.push(row([b.name, String(b.n), pct(b.cumulative), b.vital ? "yes" : ""]));
  out.push("", "## 3. Goal", "", "Every decision point has one rule that all three practices agree with and a person has approved, every translation between notations is visible and reviewed, and every case one practice cannot express is a recorded decision.", "");
  out.push(row(["Measure", "Target", ...stages.map((s) => s.name)]), row(["---", "---:", ...stages.map(() => "---:")]));
  for (const m of MEASURES) out.push(row([m.name, m.target, ...stages.map((s) => `${m.value(s, j)}${m.met(s, j) ? " ✓" : ""}`)]));
  out.push("", "## 4. Root cause analysis", "");
  j.rca.forEach((q, i) => out.push(`${i + 1}. **${q.q}** ${q.a}${q.evidence ? ` Evidence: ${q.evidence}.` : ""} ${q.depth}`));
  out.push("", "### The 5 Whys, for the off-by-one", "");
  j.whys.forEach((w, i) => out.push(`${i + 1}. **${w.q}** ${w.a}`));
  const root = j.whys.find((w) => w.root);
  if (root) out.push("", root.root!);
  out.push("", "## 5. Countermeasures", "", "To the system, never to a person. Status is computed from the reports.", "", row(["#", "Kind", "Countermeasure", "Answers", "Status"]), row(["---", "---", "---", "---", "---"]));
  for (const c of j.countermeasures) out.push(row([c.id, c.kind, c.what, c.answers, status(c, stages)]));
  out.push("", "## 6. Plan", "", row(["What", "Who", "When"]), row(["---", "---", "---"]), ...j.plan.map((p) => row(p)));
  out.push("", "## 7. Follow-up", "", "The rules at each stage, as the gate sees them:", "", row(["Rule", ...stages.map((s) => s.name)]), row(["---", ...stages.map(() => "---")]));
  for (const name of [...new Set(stages.flatMap((s) => s.rules.map((r) => r.name)))].sort()) out.push(row([`\`${name}\``, ...stages.map((s) => { const r = s.rules.find((x) => x.name === name); return r ? `${r.verdict}, ${r.authority}${r.disposition !== "candidate" ? `, ${r.disposition}` : ""}` : "absent"; })]));
  out.push("", "Agreement between the practices is a precondition for a verdict, not a verdict.", "");
  return out.join("\n");
}

// ------------------------------------------------------------------ command line

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stagesDir = arg("--stages");
  const outDir = arg("--out");
  if (stagesDir === undefined || outDir === undefined) {
    console.error("usage: node examples/lockout/a3/build.ts --stages <dir> --out <dir>");
    process.exit(2);
  }
  const j = JSON.parse(readFileSync(join(HERE, "a3.json"), "utf8")) as Judgments;
  const stages = j.stages.filter((s) => existsSync(join(stagesDir, s.id, "report.json"))).map((s) => loadStage(stagesDir, s));
  if (stages.length < 2) {
    console.error(`need at least the first two stages under ${stagesDir}`);
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "lockout-a3.html"), html(j, stages));
  writeFileSync(join(outDir, "lockout-a3.md"), markdown(j, stages));
  const unplaced = stages.flatMap((st) => st.signals.filter((s) => !j.causes.some((c) => matchesAny(s, c.match))).map((s) => `${st.id}: ${s.label}`));
  for (const u of unplaced) console.error(`unclassified signal ${u}`);
  console.log(`wrote lockout-a3.html and lockout-a3.md for ${stages.length} stages`);
}
