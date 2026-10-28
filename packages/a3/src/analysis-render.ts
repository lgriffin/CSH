// The analysis A3 as Markdown, HTML and the few lines csh analyse ends with (The analysis A3 and 1.0, sections 1 and 2;
// stages 77 and 78). Everything is rendered from the sheet alone. The Markdown holds everything the HTML holds but the
// layout, so that it can be pasted into an issue or a pull request.
import { readFileSync } from "node:fs";
import { kindName } from "@csh/check";
import { stableJson } from "@csh/kernel";
import type { AnalysisSheet, Countermeasure } from "./analysis.ts";

const CSS = readFileSync(new URL("./a3.css", import.meta.url), "utf8");
const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
/** Gap and indeterminate entries: the denominator of every count of the problem. */
const openOf = (s: AnalysisSheet) => s.current.counts.gap + s.current.counts.indeterminate;
/** How many countermeasures "Start here" shows. */
const START = 3;

export interface SheetLinks {
  /** The analysis page every anchor is in, relative to the sheet: csh-analysis.html beside it, by default. */
  analysis?: string;
}

/** A kind's plain name in parentheses, or nothing when it has none. */
const named = (kind: string) => (kindName(kind) === kind ? "" : ` (${kindName(kind)})`);
const exampleOf = (c: Countermeasure) => c.example.detail ?? c.example.subject;
const flags = (c: Countermeasure) => [...(c.danger ? ["danger"] : []), ...(c.experimental ? ["experimental"] : [])];

/** One line per countermeasure to start with: what to do, where, and what it clears. */
export function startHereLines(s: AnalysisSheet): string[] {
  const open = openOf(s);
  return s.countermeasures.slice(0, START).flatMap((c) => [`${c.id}  ${c.action}.${flags(c).length > 0 ? ` [${flags(c).join(", ")}]` : ""}`, `      ${c.place}: clears ${c.clears} of ${open}, ${c.kind}${named(c.kind)}; e.g. ${exampleOf(c)}`]);
}

/** The lines csh analyse prints after the analysis: where the sheet is, and where to start. */
export function renderStartHere(s: AnalysisSheet, sheetPath: string): string {
  if (s.countermeasures.length === 0) return `A3: ${sheetPath}. Nothing to close: every result converged.\n`;
  const n = s.countermeasures.length + s.more.countermeasures;
  return [`== Start here: ${n <= START ? `the ${plural(n, "countermeasure")} the A3 proposes` : `the first ${START} of ${n} countermeasures the A3 proposes`} (${sheetPath})`, ...startHereLines(s).map((l) => `  ${l}`), ""].join("\n");
}

export function renderSheetMarkdown(s: AnalysisSheet, links: SheetLinks = {}): string {
  const href = links.analysis ?? "csh-analysis.html";
  const open = openOf(s);
  const c = s.current.counts;
  const all = c.converged + open;
  const out: string[] = [`# A3: ${s.subject.name} at \`${s.subject.commit.slice(0, 12)}\``, "", `> ${s.problem}`, ""];
  if (s.background.experimental.length > 0) out.push(`> **Experimental:** ${s.background.experimental.join(", ")} ${s.background.experimental.length === 1 ? "is" : "are"} read by experimental readers; results in ${s.background.experimental.length === 1 ? "it" : "them"} may be incomplete or wrong. TypeScript and JavaScript are supported.`, "");
  if (s.countermeasures.length > 0) {
    out.push("**Start here**", "");
    s.countermeasures.slice(0, START).forEach((m, i) => out.push(`${i + 1}. **${m.id}** ${m.action}. In \`${m.place}\`, e.g. \`${exampleOf(m)}\`; clears ${m.clears} of ${open}.${flags(m).length > 0 ? ` _${flags(m).join(", ")}_` : ""}`));
    out.push("");
  }

  out.push("## 1. Background", "");
  out.push(`- **Repository:** ${s.subject.repo} at \`${s.subject.commit}\``);
  out.push(`- **Profile:** ${s.background.profile}${s.background.guesses > 0 ? `, with ${plural(s.background.guesses, "guess", "guesses")} (\`csh analyse --json\` lists them)` : ""}`);
  if (s.background.coverage !== undefined) out.push(`- **Read:** ${s.background.coverage}`);
  out.push(`- **Told rules lifted from prose:** ${s.background.told}`, "");

  out.push("## 2. Current condition", "", "| Outcome | Results | Of all |", "| --- | ---: | ---: |");
  out.push(`| Gap | ${c.gap} | ${pct(c.gap / Math.max(all, 1))} |`, `| Indeterminate | ${c.indeterminate} | ${pct(c.indeterminate / Math.max(all, 1))} |`, `| Converged | ${c.converged} | ${pct(c.converged / Math.max(all, 1))} |`, "");
  out.push(`Danger: ${s.current.danger.refuted} refuted and ${s.current.danger.masked} masked, each counted under its outcome too.`, "");
  if (s.current.practices.length > 0) {
    out.push("| Practice | Gap | Indeterminate | Converged |", "| --- | ---: | ---: | ---: |");
    for (const p of s.current.practices) out.push(`| ${p.practice} | ${p.gap} | ${p.indeterminate} | ${p.converged} |`);
    out.push("");
  }

  out.push("## 3. Where the problem is", "");
  if (s.pareto.length === 0) out.push("No gaps and nothing undecided: every result converged.", "");
  else {
    out.push(`Every gap and indeterminate result (${open}) by cause, largest first. The vital few, in bold, reach 80% together.`, "", "| Cause | Results | Share | Cumulative |", "| --- | ---: | ---: | ---: |");
    for (const p of s.pareto) out.push(`| ${p.vital ? `**${p.cause}**` : p.cause} | ${p.count} | ${pct(p.share)} | ${pct(p.cumulative)} |`);
    out.push("");
  }

  out.push("## 4. Why", "");
  if (s.causes.length === 0) out.push("Nothing to explain.", "");
  for (const k of s.causes) {
    out.push(`### ${k.cause}: ${k.count} of ${open}`, "");
    out.push(`- **What CSH saw:** ${k.kinds.map((x) => `${x.count} \`${x.kind}\`${named(x.kind)}`).join("; ")}`);
    out.push(`- **Where:** ${k.places.map((p) => `\`${p.place}\` (${p.count})`).join(", ")}`);
    out.push(`- **Likely mechanism** (a hypothesis to confirm): ${k.mechanism}`, "");
  }

  out.push("## 5. Goal", "", "_Proposed by CSH. The target is yours to set: some gaps are rightly accepted._", "");
  for (const g of s.goal) out.push(`- ${g}`);
  out.push("");

  out.push("## 6. Countermeasures", "");
  if (s.countermeasures.length === 0) out.push("None needed.", "");
  else {
    out.push(`Each clears a group of results of one kind in one place. Danger first, then by what each clears. Results link to [the analysis](${href}).`, "");
    for (const m of s.countermeasures) {
      const refs = m.anchors.map((a) => `[${a.slice(0, 8)}](${href}#${a})`).join(" ");
      out.push(`- [ ] **${m.id}** ${m.action}. In \`${m.place}\`, e.g. \`${exampleOf(m)}\`; clears ${m.clears} of ${open}: \`${m.kind}\`${named(m.kind)}.${flags(m).length > 0 ? ` _${flags(m).join(", ")}_.` : ""} ${refs}${m.clears > m.anchors.length ? ` and ${m.clears - m.anchors.length} more` : ""}`);
    }
    if (s.more.countermeasures > 0) out.push(`- And ${plural(s.more.countermeasures, "more countermeasure")}, for ${plural(s.more.results, "result")}: see [the analysis](${href}).`);
    out.push("");
  }

  out.push("## 7. Follow-up", "");
  for (const f of s.followUp) out.push(`- \`${f.command}\`: ${f.why}`);
  out.push("", "---", "", "_Written by `csh analyse` from the analysis alone. It decides nothing and changes no outcome; the causes and the goal are proposals._", "");
  return out.join("\n");
}

/** The analysis A3 as one self-contained page: A3 landscape when printed, both themes, phone width. */
export function renderSheetHtml(s: AnalysisSheet, links: SheetLinks = {}): string {
  const href = links.analysis ?? "csh-analysis.html";
  const open = openOf(s);
  const c = s.current.counts;
  const all = c.converged + open;
  const code = (k: string) => `<code title="${esc(kindName(k))}">${esc(k)}</code>`;
  const chips = (m: Countermeasure) => flags(m).map((f) => `<span class="chip ${f === "danger" ? "contradiction" : "drift"}">${f}</span>`).join(" ");
  const cm = (m: Countermeasure, brief: boolean) => `<li class="cm${m.danger ? " danger" : ""}" id="${esc(m.id)}"><span class="cid">${esc(m.id)}</span><div><p class="act">${esc(m.action)}.</p><p class="where">In <code>${esc(m.place)}</code></p><p class="ex">e.g. ${esc(exampleOf(m))}</p><p class="where">Clears <strong>${m.clears}</strong> of ${open} · ${esc(kindName(m.kind))} ${brief ? "" : `<span class="k2">${esc(m.kind)}</span>`} ${chips(m)}</p>${brief ? "" : `<p class="refs">${m.anchors.map((a) => `<a href="${esc(href)}#${esc(a)}">${esc(a.slice(0, 8))}</a>`).join(" ")}${m.clears > m.anchors.length ? ` <span class="src">and ${m.clears - m.anchors.length} more</span>` : ""}</p>`}</div></li>`;
  const tile = (k: string, n: number, sub: string, tone = "") => `<div class="tile${tone}"><span class="k">${k}</span><span class="huge">${n}</span><span class="sub">${sub}</span></div>`;
  const danger = s.current.danger.refuted + s.current.danger.masked;
  const blocks: Record<string, string> = {
    background: `<section class="blk"><h2><span class="n">1</span>Background</h2><dl class="facts"><dt>Repository</dt><dd>${esc(s.subject.repo)} at <code>${esc(s.subject.commit)}</code></dd><dt>Profile</dt><dd>${esc(s.background.profile)}${s.background.guesses > 0 ? `, with ${plural(s.background.guesses, "guess", "guesses")}` : ""}</dd>${s.background.coverage !== undefined ? `<dt>Read</dt><dd>${esc(s.background.coverage)}</dd>` : ""}<dt>Told rules</dt><dd>${s.background.told} lifted from prose</dd></dl></section>`,
    current: `<section class="blk"><h2><span class="n">2</span>Current condition</h2><div class="scroll"><table><thead><tr><th>Practice</th><th class="num">Gap</th><th class="num">Indeterminate</th><th class="num">Converged</th></tr></thead><tbody>${s.current.practices.map((p) => `<tr><td>${esc(p.practice)}</td><td class="num">${p.gap}</td><td class="num">${p.indeterminate}</td><td class="num">${p.converged}</td></tr>`).join("")}<tr class="sum"><td>All</td><td class="num">${c.gap}</td><td class="num">${c.indeterminate}</td><td class="num">${c.converged}</td></tr></tbody></table></div><p class="note">Danger: ${s.current.danger.refuted} refuted and ${s.current.danger.masked} masked, each counted under its outcome too.</p></section>`,
    pareto: `<section class="blk"><h2><span class="n">3</span>Where the problem is<span class="hint">${open} gap and indeterminate results by cause; the vital few reach 80% together</span></h2>${s.pareto.length === 0 ? `<p class="none">No gaps and nothing undecided: every result converged.</p>` : `<div class="pareto"><div class="phead"><span>Cause</span><span></span><span>n</span><span>cum.</span></div><ol class="bars">${s.pareto.map((p) => `<li class="${p.vital ? "vital" : ""}"><span class="pl">${esc(p.cause)}</span><span class="pb"><span class="bar" style="width:${Math.max(2, Math.round(p.share * 100))}%"></span></span><span class="pv">${p.count}</span><span class="pc">${pct(p.cumulative)}</span></li>`).join("")}</ol></div>`}</section>`,
    why: `<section class="blk"><h2><span class="n">4</span>Why<span class="hint">the mechanism is a hypothesis to confirm</span></h2>${s.causes.length === 0 ? `<p class="none">Nothing to explain.</p>` : `<ol class="rcas">${s.causes.map((k, i) => `<li class="rca"><span class="qn">${i + 1}</span><div><p class="q">${esc(k.cause)}: ${k.count} of ${open}</p><p><span class="src">Saw</span> ${k.kinds.map((x) => `${x.count} ${esc(kindName(x.kind))} ${code(x.kind)}`).join("; ")}</p><p><span class="src">Where</span> ${k.places.map((p) => `<code>${esc(p.place)}</code> (${p.count})`).join(", ")}</p><p class="depth">Likely: ${esc(k.mechanism)}</p></div></li>`).join("")}</ol>`}</section>`,
    goal: `<section class="blk"><h2><span class="n">5</span>Goal<span class="status proposed">proposed</span></h2><ul class="goal">${s.goal.map((g) => `<li>${esc(g)}</li>`).join("")}</ul><p class="note">The target is yours to set: some gaps are rightly accepted.</p></section>`,
    counter: `<section class="blk"><h2><span class="n">6</span>Countermeasures<span class="hint">danger first, then by what each clears; each result links to the analysis</span></h2>${s.countermeasures.length === 0 ? `<p class="none">None needed.</p>` : `<ol class="cms">${s.countermeasures.map((m) => cm(m, false)).join("")}</ol>${s.more.countermeasures > 0 ? `<p class="note">And ${plural(s.more.countermeasures, "more countermeasure")}, for ${plural(s.more.results, "result")}: see <a href="${esc(href)}">the analysis</a>.</p>` : ""}`}</section>`,
    follow: `<section class="blk"><h2><span class="n">7</span>Follow-up</h2><dl class="facts">${s.followUp.map((f) => `<dt><code>${esc(f.command)}</code></dt><dd>${esc(f.why)}</dd>`).join("")}</dl></section>`,
  };
  const experimental = s.background.experimental.length > 0 ? `<p class="banner"><strong>Experimental.</strong> ${esc(s.background.experimental.join(", "))} ${s.background.experimental.length === 1 ? "is" : "are"} read by experimental readers; results in ${s.background.experimental.length === 1 ? "it" : "them"} may be incomplete or wrong. TypeScript and JavaScript are supported.</p>` : "";
  const start = s.countermeasures.length === 0 ? "" : `<section class="start" aria-labelledby="start"><h2 id="start">Start here</h2><ol class="cms brief">${s.countermeasures.slice(0, START).map((m) => cm(m, true)).join("")}</ol></section>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>A3: ${esc(s.subject.name)}</title>
<style>${CSS}
${EXTRA}</style></head>
<body><main class="sheet">
<header class="title"><h1>A3 <span>· ${esc(s.subject.name)}</span></h1><span class="meta"><code>${esc(s.subject.commit.slice(0, 12))}</code> · written by <code>csh analyse</code> from <a href="${esc(href)}">the analysis</a> · proposals, not judgments</span></header>
<p class="problem">${esc(s.problem)}</p>
${experimental}
<section class="andon" aria-label="Results">${tile("Gaps", c.gap, `of ${all} results`, c.gap > 0 ? " fail" : "")}${tile("Indeterminate", c.indeterminate, `of ${all} results`)}${tile("Converged", c.converged, `of ${all} results`, c.converged === all && all > 0 ? " pass" : "")}${tile("Danger", danger, `${s.current.danger.refuted} refuted, ${s.current.danger.masked} masked`, danger > 0 ? " fail" : "")}${tile("Countermeasures", s.countermeasures.length + s.more.countermeasures, `${s.countermeasures.length} listed`)}</section>
${start}
<div class="a3"><div class="col">${blocks.background}${blocks.current}${blocks.pareto}</div><div class="col">${blocks.why}${blocks.goal}</div></div>
<div class="wide">${blocks.counter}</div>
<div class="wide">${blocks.follow}</div>
<footer>Written by <code>csh analyse</code> from the analysis alone. It decides nothing and changes no outcome; the causes and the goal are proposals.</footer>
</main></body></html>
`;
}

/** What the analysis A3 adds to the component A3's stylesheet. */
const EXTRA = `.facts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;margin:0;font-size:13px} .facts dt{color:var(--ink2)} .facts dd{margin:0;min-width:0;overflow-wrap:anywhere}
.banner{background:var(--soft-warn);border-left:4px solid var(--warn);border-radius:4px;padding:8px 12px;margin:12px 0 0;max-width:100ch}
.start{margin:14px 0 0;background:var(--sheet);border:2px solid var(--ink);border-radius:8px;padding:12px 16px}
.start h2{font-size:1rem;margin:0 0 8px}
ol.cms{list-style:none;margin:0;padding:0;display:grid;gap:8px 24px;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr))}
.brief{grid-template-columns:minmax(0,1fr) !important}
.cm{display:grid;grid-template-columns:2.6rem minmax(0,1fr);gap:8px;padding:6px 0;border-bottom:1px solid var(--rule)} .cm:last-child{border-bottom:0}
.cm .cid{font-weight:800;color:var(--ink2)} .cm.danger .cid{color:var(--fail)}
.cm p{margin:0} .cm .act{font-weight:600} .cm .where{font-size:12.5px;color:var(--ink2)} .cm .refs{font-size:12px} .cm .refs a{font-family:var(--mono);margin-right:6px}
.brief .cm{border-bottom:0;padding:2px 0}
.goal{margin:0;padding-left:1.2rem} .goal li{margin:2px 0}
tr.sum td{font-weight:700;border-top:2px solid var(--rule)}
code{overflow-wrap:anywhere}
.cm .ex{color:var(--ink2);font-size:12px;overflow-wrap:anywhere} .cm .k2{font:11.5px var(--mono);color:var(--ink2);border:1px solid var(--rule);border-radius:4px;padding:0 5px}
@media (max-width:520px){.andon{grid-template-columns:repeat(2,minmax(0,1fr))} .tile .huge{font-size:1.7rem} .facts{grid-template-columns:minmax(0,1fr)} .facts dd{margin-bottom:6px}}
@media print{@page{size:A3 landscape;margin:10mm}
:root,:root:not([data-theme="light"]),:root[data-theme="dark"]{color-scheme:light;--bg:#fff;--sheet:#fff;--ink:#000;--ink2:#444;--rule:#ccc;--box:#fff;--soft-warn:#f6ecd9}
body{background:#fff} .sheet{max-width:none;padding:0} .blk,.start,.tile{break-inside:avoid}
.cm .refs a::after{content:" (#" attr(href) ")";font-size:10px;color:#444}}`;

/** The three files of an analysis A3, by name, as csh analyse writes them beside csh-analysis.html. */
export function sheetFiles(s: AnalysisSheet): Record<"csh-a3.json" | "csh-a3.md" | "csh-a3.html", string> {
  return { "csh-a3.json": stableJson(s), "csh-a3.md": renderSheetMarkdown(s), "csh-a3.html": renderSheetHtml(s) };
}
