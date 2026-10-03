// The A3 as one self-contained page, rendered from the model alone (Anchor, harnesses and A3, section 5.1). A stage
// picker shows each stage; everything that varies by stage is drawn once per stage and hidden but for one.
import { readFileSync } from "node:fs";
import { authorityLine, UNWRITTEN } from "./markdown.ts";
import type { A3Model, SheetStage } from "./types.ts";

const CSS = readFileSync(new URL("./a3.css", import.meta.url), "utf8");
const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const pct = (x: number) => `${Math.round(x * 100)}%`;
const unwritten = `<span class="unwritten">${UNWRITTEN}</span>`;
const text = (s: string) => (s.trim() === "" ? unwritten : esc(s));
const name = (st: { id: string; name: string }) => (st.name.trim() === "" ? st.id : st.name);

function wrap(s: string, width: number): string[] {
  if (s.length <= width) return [s];
  const at = s.lastIndexOf(" ", Math.min(width, Math.ceil(s.length / 2) + 6));
  return at <= 0 ? [s] : [s.slice(0, at), s.slice(at + 1)];
}

export function renderHtml(m: A3Model): string {
  const stages = m.stages;
  const colour = new Map(m.practices.map((p, i) => [p.id, `p${i % 5}`]));
  const tag = (id: string) => `<span class="tag ${colour.get(id) ?? ""}">${esc(m.practices.find((p) => p.id === id)?.name ?? id)}</span>`;
  const attr = (st: SheetStage, i: number) => `data-stage="${esc(st.id)}"${i === 0 ? "" : " hidden"}`;
  const each = (f: (st: SheetStage, i: number) => string) => stages.map((st, i) => f(st, i)).join("\n");
  const labelOf = (i: number, id: string) => stages[i]?.signals.find((s) => s.id === id)?.label ?? id;

  const tiles = (st: SheetStage, i: number) => {
    const counts = new Map<string, number>();
    for (const s of st.signals) {
      const k = s.kind.endsWith("-conflict") ? "conflicts" : s.kind === "example-divergence" ? "divergences" : s.kind === "not-comparable" ? "not comparable" : ["shape-mismatch", "dangling-citation"].includes(s.kind) ? "errors and warnings" : s.kind === "violated" ? "violated" : "gaps";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const breakdown = ["conflicts", "divergences", "violated", "not comparable", "errors and warnings", "gaps"].filter((k) => counts.has(k)).map((k) => `${counts.get(k)} ${k}`).join(", ");
    const dp = m.decisionPoints.filter((d) => (d.signals[i] ?? []).length > 0);
    const byClass = ["contradiction", "drift", "silence"].map((c) => `${dp.filter((d) => d.class === c).length} ${c === "silence" ? "silences" : `${c}s`}`).join(" · ");
    const green = st.tests.passed === st.tests.total;
    const gateTone = st.gate.overall === "block" ? " fail" : st.gate.overall === "allow" && st.gate.mode === "enforcing" ? " pass" : "";
    return `<section class="andon" aria-label="Scoring at stage ${esc(name(st))}" ${attr(st, i)}>
  <div class="tile${green ? " pass" : " fail"}"><span class="k">Each practice alone</span><span class="huge">${green ? "Green" : "Red"}</span><span class="sub">${st.tests.passed} of ${st.tests.total} tests pass</span></div>
  <div class="tile${st.signals.some((s) => s.kind.endsWith("-conflict") || s.kind === "violated") ? " fail" : ""}"><span class="k">Read together by CSH</span><span class="huge">${st.signals.length}</span><span class="sub">signals: ${esc(breakdown || "none")}</span></div>
  <div class="tile"><span class="k">Decision points with a signal</span><span class="huge">${dp.length}</span><span class="sub">${byClass}</span></div>
  <div class="tile${gateTone}"><span class="k">Gate · ${esc(st.gate.mode)}</span><span class="huge">${esc(st.gate.overall)}</span><span class="sub">${st.rules.filter((r) => r.authority === "approved").length} of ${st.rules.length} rules approved${st.rules.some((r) => r.selfApproved) ? ", self-approved" : ""}</span></div>
</section>`;
  };

  // The lanes: one row per practice, one column per step, and the hub where the practices first meet.
  const rows = m.practices.map((p) => p.id);
  const steps = Math.max(1, ...m.lanes.filter((l) => l.practice !== "hub").map((l) => l.step));
  const rowY = (r: number) => 22 + r * 105;
  const colX = (s: number) => 176 + (s - 1) * 215;
  const hubX = colX(steps + 1) + 40;
  const height = Math.max(150, rowY(rows.length) + 10);
  const mid = height / 2;
  const lanesSvg = (st: SheetStage, i: number) => {
    const parts: string[] = [];
    const andon = (x: number, y: number, n: number) => (n === 0 ? "" : `<g class="andon"><rect x="${x}" y="${y}" width="40" height="20" rx="4"/><text x="${x + 20}" y="${y + 14}" text-anchor="middle">${n}</text></g>`);
    const arrows: string[] = [];
    rows.forEach((pid, r) => {
      const y = rowY(r);
      parts.push(`<rect x="160" y="${y}" width="6" height="66" class="lane-${colour.get(pid)}"/>`);
      arrows.push(`M130 ${mid} C145 ${mid} 145 ${y + 33} 172 ${y + 33}`);
      const own = m.lanes.filter((l) => l.practice === pid).sort((a, b) => a.step - b.step);
      for (const l of own) {
        const x = colX(l.step);
        const [a, b] = wrap(l.title, 26);
        parts.push(`<rect x="${x}" y="${y}" width="190" height="66" rx="6" class="box"/><text x="${x + 10}" y="${y + 22}">${esc(a ?? "")}</text><text x="${x + 10}" y="${y + 40}">${esc(b ?? "")}</text><text x="${x + 10}" y="${y + 56}" class="small">${esc(l.where)}</text>${andon(x + 164, y - 10, l.counts[i] ?? 0)}`);
      }
      for (let s = 1; s < steps; s++) arrows.push(`M${colX(s) + 190} ${y + 33} L${colX(s + 1) - 4} ${y + 33}`);
      arrows.push(`M${colX(steps) + 190} ${y + 33} C${hubX - 30} ${y + 33} ${hubX - 30} ${mid} ${hubX - 4} ${mid}`);
    });
    for (const l of m.lanes.filter((x) => x.practice === "hub")) {
      const [a, b] = wrap(l.title, 26);
      parts.push(`<rect x="${hubX}" y="${mid - 45}" width="200" height="90" rx="8" class="hub"/><text x="${hubX + 10}" y="${mid - 20}">${esc(a ?? "")}</text><text x="${hubX + 10}" y="${mid - 2}">${esc(b ?? "")}</text><text x="${hubX + 10}" y="${mid + 18}" class="small">${esc(l.where)}</text>${andon(hubX + 170, mid - 55, l.counts[i] ?? 0)}`);
    }
    const placed = st.signals.filter((s) => s.lane !== undefined).length;
    return `<div class="scroll" ${attr(st, i)}><svg class="lanes" viewBox="0 0 ${hubX + 220} ${height}" role="img" aria-label="The intent is translated by each practice in its own lane, and the lanes meet in the harness. At stage ${esc(name(st))}, ${placed} signals are placed on the hand-offs.">
  <defs><marker id="ah-${esc(st.id)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 Z" class="head"/></marker></defs>
  <rect x="10" y="${mid - 35}" width="120" height="70" rx="8" class="story"/><text x="70" y="${mid - 5}" text-anchor="middle">Intent</text><text x="70" y="${mid + 12}" text-anchor="middle" class="small">${esc(m.component)}</text>
  ${arrows.map((d) => `<path d="${d}" class="arrow" marker-end="url(#ah-${esc(st.id)})"/>`).join("")}
  ${parts.join("\n  ")}
</svg></div>`;
  };

  const decisionTable = (st: SheetStage, i: number) => {
    if (m.decisionPoints.length === 0) return `<p ${attr(st, i)}>Decision points: ${unwritten}</p>`;
    const body = m.decisionPoints.map((d) => {
      const hits = d.signals[i] ?? [];
      const harness = hits.length === 0 ? `<span class="none">no signal at this stage</span>` : `${hits.map((id) => esc(labelOf(i, id))).join("<br>")}${d.note !== undefined ? `<br><span class="src">${esc(d.note)}</span>` : ""}`;
      return `<tr><td>${esc(d.point)}</td>${m.practices.map((p) => { const c = d.says[p.id]; return `<td><span class="cell ${c?.mark ?? "silent"}">${esc(c?.text ?? "silent")}</span></td>`; }).join("")}<td>${harness}</td><td><span class="chip ${esc(d.class)}">${esc(d.class)}</span></td></tr>`;
    });
    return `<div class="scroll" ${attr(st, i)}><table><thead><tr><th>Decision point</th>${m.practices.map((p) => `<th>${tag(p.id)}</th>`).join("")}<th>CSH reports at ${esc(name(st).toLowerCase())}</th><th>Class</th></tr></thead><tbody>
${body.join("\n")}
</tbody></table><p class="src">The practice columns are what the artefacts say, as a person read them. The CSH column is read from this stage's report.</p></div>`;
  };

  const paretoHtml = (st: SheetStage, i: number) => {
    const bars = m.pareto[i]?.bars ?? [];
    if (bars.length === 0) return `<figure class="pareto" ${attr(st, i)}><figcaption><strong>Pareto: signals by cause</strong></figcaption><p class="none">No signals at this stage.</p></figure>`;
    const max = Math.max(...bars.map((b) => b.n));
    const total = bars.reduce((t, b) => t + b.n, 0);
    const cut = bars.findIndex((b) => !b.vital);
    const items = bars.map((b, k) => `${k === cut ? `<li class="cut" aria-hidden="true"><span>80% crossed: the vital few above, the useful many below</span></li>` : ""}<li class="${b.vital ? "vital" : ""}"><span class="pl">${esc(b.name)}</span><span class="pb"><span class="bar" style="width:${((b.n / max) * 100).toFixed(1)}%"></span></span><span class="pv">${b.n}</span><span class="pc">${pct(b.cumulative)}</span></li>`);
    return `<figure class="pareto" ${attr(st, i)}><figcaption><strong>Pareto: the ${total} signals by cause</strong><span class="src">every signal of the ${esc(name(st).toLowerCase())} report, placed by the cause rules in the judgments</span></figcaption>
<div class="phead" aria-hidden="true"><span></span><span></span><span>n</span><span>cum.</span></div>
<ol class="bars">${items.join("")}</ol></figure>`;
  };

  const signalList = (st: SheetStage, i: number) =>
    `<details ${attr(st, i)}><summary>Every signal at ${esc(name(st).toLowerCase())} (${st.signals.length})</summary><div class="scroll"><table><thead><tr><th>Kind</th><th>Signal</th><th>Cause</th></tr></thead><tbody>${st.signals.map((s) => `<tr><td><code>${esc(s.kind)}</code></td><td>${esc(s.label)}</td><td>${s.cause === undefined ? `<span class="no">unclassified</span>` : esc(s.cause)}</td></tr>`).join("") || `<tr><td colspan="3" class="none">none</td></tr>`}</tbody></table></div></details>`;

  const rulesTable = (st: SheetStage, i: number) =>
    `<div class="scroll" ${attr(st, i)}><table><thead><tr><th>Rule</th><th>Authority</th><th>Verdict</th><th>Gate</th></tr></thead><tbody>${st.rules.map((r) => `<tr><td><code>${esc(r.name)}</code></td><td>${esc(r.authority)}${r.selfApproved ? ", self-approved" : ""}</td><td><span class="verdict ${esc(r.verdict)}">${esc(r.verdict)}</span></td><td>${r.disposition === "candidate" ? `<span class="none">candidate, never blocks</span>` : `<span class="verdict ${esc(r.disposition)}">${esc(r.disposition)}</span>`}</td></tr>`).join("") || `<tr><td colspan="4" class="none">no rules</td></tr>`}</tbody></table></div>`;

  const picker = `<fieldset class="stages" aria-label="Stage"><span class="k">Stage</span>${stages.map((st, i) => `<label><input type="radio" name="stage" value="${esc(st.id)}" id="stage-${esc(st.id)}"${i === 0 ? " checked" : ""}>${esc(name(st))}</label>`).join("")}</fieldset>
${stages.map((st, i) => `<p class="stage-what" ${attr(st, i)}>${text(st.what)}</p>`).join("\n")}`;
  const timeline = `<div class="timeline">${stages.map((st) => `<div><span class="sn">${esc(name(st))}</span><br><span class="sv">${st.tests.passed} of ${st.tests.total} tests pass · ${st.signals.length} signals · ${st.conflicts} conflicts${st.signals.some((s) => s.kind === "violated") ? " · a rule violated" : ""}</span><br><span class="verdict ${esc(st.gate.overall)}">${esc(st.gate.overall)}</span> <span class="sv">${esc(st.gate.mode)} gate</span></div>`).join("")}</div>`;
  const goal = `<p>${text(m.goal)}</p><div class="scroll"><table><thead><tr><th>Measure</th><th class="num">Target</th>${stages.map((st, i) => `<th class="num" title="${esc(name(st))}">${i + 1}</th>`).join("")}</tr></thead><tbody>${m.measures.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${esc(x.target)}</td>${x.values.map((v) => `<td class="num">${esc(v.value)} ${v.met ? `<span class="ok">✓</span>` : `<span class="no">·</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
<p class="src">Stages: ${stages.map((st, i) => `${i + 1} ${esc(name(st).toLowerCase())}`).join(", ")}. ✓ meets the target at that stage. Every value is counted from that stage's report and gate decision.</p>`;
  const compare = m.practices.length === 0 ? "" : `<div class="compare">${m.practices.map((p) => `<div><h4>${tag(p.id)} ${esc(p.kind)}</h4><dl><dt>Author</dt><dd>${esc(p.author ?? "")}</dd><dt>One artefact</dt><dd>${esc(p.unit ?? "")}</dd><dt>Sources</dt><dd>${esc(p.sources.join(", "))}</dd><dt>Cannot say</dt><dd>${text(p.cannotSay ?? "")}</dd></dl></div>`).join("")}</div>`;
  const evidence = (e: A3Model["rca"][number]["evidence"]) => (e === undefined ? "" : `<p class="src">Evidence: ${"finding" in e ? `finding <code>${esc(e.finding)}</code> at stage ${esc(e.stage)}` : `“${esc(e.text)}” in <code>${esc(e.file)}</code>`}${e.resolves ? "" : ` <span class="no">dangling</span>`}</p>`);
  const rca = m.rca.length === 0 ? `<p>${unwritten}</p>` : `<ol class="rcas">${m.rca.map((q) => `<li class="rca"><span class="qn">${esc(q.id)}</span><div><p class="q">${esc(q.q)}</p><p>${esc(q.a)}</p>${evidence(q.evidence)}<span class="depth">${esc(q.depth)}</span></div></li>`).join("")}</ol>`;
  const statusClass = (s: string) => (s === "verified" ? "done" : s === "owner decides" ? "decide" : "proposed");
  const cms = m.countermeasures.length === 0 ? `<p>${unwritten}</p>` : `<div class="scroll"><table><thead><tr><th>#</th><th>Kind</th><th>Countermeasure</th><th>Answers</th><th>Status</th></tr></thead><tbody>${m.countermeasures.map((c) => `<tr><td>${esc(c.id)}</td><td><span class="kind">${esc(c.kind)}</span></td><td>${esc(c.what)}</td><td>${esc(c.answers.join(" "))}</td><td><span class="status ${statusClass(c.status)}">${esc(c.status)}</span></td></tr>`).join("")}</tbody></table></div>
<p class="note">Status is computed: verified when the signals it clears are present at the first stage and gone at a later one, when a signal it expects appears, when the stage it names ends with the enforcing gate allowing, or when the measure it names meets its target at the last stage.</p>`;
  const plan = m.plan.length === 0 ? `<p>${unwritten}</p>` : `<div class="scroll"><table><thead><tr><th>What</th><th>Who</th><th>When</th></tr></thead><tbody>${m.plan.map((p) => `<tr><td>${esc(p.what)}</td><td>${esc(p.who)}</td><td>${esc(p.when)}</td></tr>`).join("")}</tbody></table></div>`;
  const whys = m.whys.length === 0 ? `<p>${unwritten}</p>` : `<ol class="chain">${m.whys.map((w, i) => `<li${w.root !== undefined ? ` class="root"` : ""}><span class="wn">Why ${i + 1}</span><div><p class="q">${esc(w.q)}</p><p>${esc(w.a)}</p>${evidence(w.evidence)}${w.root !== undefined ? `<p class="rootcause">${esc(w.root)}</p>` : ""}</div></li>`).join("")}</ol>`;
  const problems = m.problems.length === 0 ? `<p class="none">None.</p>` : `<ul class="problems">${m.problems.map((p) => `<li><code>${esc(p.kind)}</code>${p.stage !== undefined ? ` at ${esc(p.stage)}` : ""}: ${esc(p.subject)}. ${esc(p.detail)}.</li>`).join("")}</ul>`;
  const followUp = `<p>At the last stage the ${esc(m.followUp.gate.mode)} gate says <span class="verdict ${esc(m.followUp.gate.overall)}">${esc(m.followUp.gate.overall)}</span>.${m.followUp.returned.length > 0 ? ` Signals that went away and came back: ${m.followUp.returned.map(esc).join("; ")}.` : ""}</p>`;
  const script = `<script>
(function () {
  var key = ${JSON.stringify(`a3-stage-${m.slug}`)};
  var pick = function (id) {
    document.querySelectorAll("[data-stage]").forEach(function (el) { el.hidden = el.getAttribute("data-stage") !== id; });
    try { localStorage.setItem(key, id); } catch (e) {}
  };
  document.querySelectorAll('input[name="stage"]').forEach(function (r) { r.addEventListener("change", function () { pick(r.value); }); });
  var saved = null;
  try { saved = localStorage.getItem(key); } catch (e) {}
  var input = saved && document.getElementById("stage-" + saved);
  if (input) { input.checked = true; pick(saved); }
})();
</script>`;
  const auth = m.authority.authority;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(m.title.trim() === "" ? `A3 ${m.slug}` : m.title)}</title>
<style>
${CSS}</style>
</head><body>
<main class="sheet">
<header class="title"><h1>A3 <span>· ${text(m.title)}</span></h1><span class="meta">Component <code>${esc(m.component)}</code> · built by <code>csh a3 build ${esc(m.slug)}</code> from its stage records and judgments · <span class="authority ${auth}">${esc(authorityLine(m))}</span></span></header>
<p class="problem"><strong>Problem.</strong> ${text(m.problem)}</p>
${picker}
${each(tiles)}
<div class="blk wide"><h2>The run, stage by stage <span class="hint">plan, do, check, act, once per stage</span></h2>${timeline}</div>

<div class="a3">
<section class="blk"><h2><span class="n">1</span>Background <span class="hint">why this matters</span></h2>${m.background.length === 0 ? `<p>${unwritten}</p>` : m.background.map((p) => `<p>${esc(p)}</p>`).join("")}${compare}</section>
<section class="blk"><h2><span class="n">3</span>Goal <span class="hint">the target condition, measured at every stage</span></h2>
${goal}</section>
</div>

<section class="blk wide"><h2><span class="n">2</span>Current condition <span class="hint">go and see: how intent travels to the code, and where it is lost</span></h2>
<figure><figcaption><strong>One lane per practice</strong><span class="src">each red mark counts the signals placed at that hand-off by the lane rules in the judgments</span></figcaption>
${each(lanesSvg)}
<div class="legend">${m.practices.map((p) => `<span><i style="background:var(--${colour.get(p.id)})"></i>${esc(p.name)}</span>`).join("")}<span><i style="background:var(--fail)"></i>signals at that hand-off</span></div>
</figure>
<h3>What each practice says at each decision point</h3>
${each(decisionTable)}
<div class="legend"><span><i style="background:var(--soft-pass)"></i>states it</span><span><i style="background:var(--soft-fail)"></i>contradicts another practice</span><span><i style="background:var(--soft-warn)"></i>states it in a form that drifted</span><span><i style="background:var(--soft-mute)"></i>silent</span></div>
${each(paretoHtml)}
${each(signalList)}
</section>

<div class="a3">
<section class="blk"><h2><span class="n">4</span>Root cause analysis <span class="hint">each question as deep as the evidence goes</span></h2>${rca}</section>
<div class="col">
<section class="blk"><h2><span class="n">5</span>Countermeasures <span class="hint">to the system, never to a person</span></h2>${cms}</section>
<section class="blk"><h2><span class="n">6</span>Plan <span class="hint">who, what, when</span></h2>${plan}</section>
<section class="blk"><h2><span class="n">7</span>Follow-up <span class="hint">the rules at this stage, as the gate sees them</span></h2>
${followUp}
${each(rulesTable)}</section>
</div>
</div>

<section class="blk wide"><h2><span class="n">4</span>The 5 Whys <span class="hint">asked until the answer is a process or a tool, never a person</span></h2>${whys}</section>
${m.terms.length === 0 ? "" : `<section class="blk wide terms"><h2>Terms on this sheet</h2><dl>${m.terms.map((t) => `<div><dt>${esc(t.term)}</dt><dd>${esc(t.meaning)}</dd></div>`).join("")}</dl></section>`}
<section class="blk wide"><h2>Problems with the judgments <span class="hint">reported by the builder, never repaired</span></h2>${problems}</section>
<footer>Advisory, like the harness's own report: an A3 never changes a verdict or a gate decision. It reads them.</footer>
</main>
${script}
</body></html>
`;
}
