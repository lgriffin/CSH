// The Gherkin inventory adapter (Ingesting a codebase, stage 22): the structure of feature files, without a step
// table. Each feature, rule and scenario is one item. A rule's title is its requirement, classified by EARS pattern;
// a scenario exemplifies the rule it sits under, or the feature when it sits under none. Tags are kept as a field, and
// a tag the practice's `tagCites` pattern matches cites the identifier its first group captures. Nothing is lifted
// to a claim and nothing is executed: lifting needs the step table, which the scenario adapter loads (A-37).
import { classify } from "@csh/adapter-ears-markdown";
import { digestOf } from "@csh/kernel";
import { type Adapter, type AdapterInput, type AdapterOutput, type Diagnostic, type ItemEdge, parseTestResults, type SourceItem, type TestResult } from "@csh/witness";
import { decode, idPatternOf, slug, sortedFiles, unique } from "./common.ts";
import { fileOf } from "./tests.ts";

export const manifest = {
  id: "csh.adapter.items.gherkin",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["items", "edges", "results"],
  inputKinds: ["Features", "Scenarios"],
} as const;

const HEADER = /^(Feature|Rule|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples|Scenarios):\s*(.*)$/;

const STEP_LINE = /^(?:Given|When|Then|And|But|\*)\s+(.*)$/;

/** A scenario being read: its steps as written, and an outline's rows, expanded once the scenario ends (stage 42). */
interface Open {
  item: SourceItem;
  background: string[];
  steps: { line: number; text: string }[];
  outline: boolean;
  header?: string[];
  rows: { line: number; cells: string[] }[];
}

const cellsOf = (line: string) => line.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

/** Each step of a scenario, `line<TAB>text`: its background's first, an outline's once per row of its examples. */
function stepsOf(o: Open): string[] {
  const own = o.outline && o.header !== undefined && o.rows.length > 0
    ? o.rows.flatMap((r) => o.steps.map((st) => ({ line: st.line, text: st.text.replace(/<([^<>]+)>/g, (all, name: string) => r.cells[o.header!.indexOf(name.trim())] ?? all) })))
    : o.steps;
  return [...new Set([...o.background, ...own.map((st) => `${st.line}\t${st.text}`)])];
}

export function run(input: AdapterInput): AdapterOutput {
  const items: SourceItem[] = [];
  const edges: ItemEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  const tagCites = input.config?.tagCites !== undefined ? new RegExp(`^@${input.config.tagCites}$`) : undefined;
  // A tag that is the rule's own identifier (`idTag`, first group): the rule keeps it as its id, and it cites nothing.
  const idTag = input.config?.idTag !== undefined ? new RegExp(`^@${input.config.idTag}$`) : undefined;
  // Description lines that name decisions (stage 42), such as `Decisions|Specified by`.
  const decisions = input.config?.decisionsField !== undefined ? new RegExp(`^(?:${input.config.decisionsField})\\s*:\\s*(.*)$`, "i") : undefined;
  const decisionId = new RegExp(`\\b(?:${idPatternOf(input)})\\b`, "g");
  // A pattern over a feature file's path whose first group is the file's identity (stage 42).
  const fileId = input.config?.fileId !== undefined ? new RegExp(input.config.fileId) : undefined;
  const byFileId = new Map<string, string[]>();
  for (const file of sortedFiles(input)) {
    if (!file.path.endsWith(".feature")) continue;
    const taken = new Set<string>();
    let feature: SourceItem | undefined;
    let rule: SourceItem | undefined;
    let tags: string[] = [];
    let doc: string | undefined;
    // What the lines being read belong to: a description, a background, a scenario or its examples.
    let mode: "feature" | "rule" | "background" | "scenario" | "examples" | "other" = "other";
    let describing: SourceItem | undefined;
    let featureBackground: string[] = [];
    let ruleBackground: string[] = [];
    let background: string[] | undefined;
    let open: Open | undefined;
    const before = items.length;
    const close = () => {
      if (open !== undefined) {
        const steps = stepsOf(open);
        if (steps.length > 0) open.item.attrs = { ...(open.item.attrs ?? {}), steps: steps.join("\n") };
      }
      open = undefined;
    };
    const item = (kind: "feature" | "rule" | "scenario", id: string, title: string, span: string): SourceItem => {
      const it: SourceItem = { id, kind, text: title, span, textDigest: digestOf(title) };
      if (tags.length > 0) {
        it.attrs = { tags: tags.join(" ") };
        if (tagCites !== undefined) for (const t of tags) {
          const m = tagCites.exec(t);
          if (m !== null && !(idTag?.test(t) === true)) edges.push({ from: id, rel: "cites", to: m[1] ?? m[0].slice(1), span });
        }
      }
      items.push(it);
      tags = [];
      return it;
    };
    decode(file.bytes).split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      const span = `${file.path}:${i + 1}`;
      // A doc string is step data: nothing in it is structure.
      const ds = /^("""|```)/.exec(line);
      if (ds !== null) {
        if (doc === undefined) doc = ds[1];
        else if (doc === ds[1]) doc = undefined;
        return;
      }
      if (doc !== undefined || line === "" || line.startsWith("#")) return;
      if (line.startsWith("@")) {
        tags.push(...line.replace(/\s+#.*$/, "").split(/\s+/));
        return;
      }
      const h = HEADER.exec(line);
      if (h === null) {
        const st = STEP_LINE.exec(line);
        if (st !== null && mode === "background") background!.push(`${i + 1}\t${st[1]!.trim()}`);
        else if (st !== null && mode === "scenario") open!.steps.push({ line: i + 1, text: st[1]!.trim() });
        else if (line.startsWith("|") && mode === "examples") {
          if (open!.header === undefined) open!.header = cellsOf(line);
          else open!.rows.push({ line: i + 1, cells: cellsOf(line) });
        } else if ((mode === "feature" || mode === "rule") && describing !== undefined && decisions !== undefined) {
          const d = decisions.exec(line);
          if (d !== null) {
            const rest = d[1]!;
            for (const m of rest.matchAll(decisionId)) edges.push({ from: describing.id, rel: "decided-by", to: m[0], span });
            for (const m of rest.matchAll(/[\w./-]+\.md\b/g)) edges.push({ from: describing.id, rel: "decided-by", to: `file:${m[0].replace(/^\.\//, "")}`, span });
          }
        }
        return;
      }
      const kw = h[1]!;
      const title = h[2]!.trim();
      if (kw !== "Examples" && kw !== "Scenarios") close();
      if (kw === "Feature") {
        if (feature !== undefined) diagnostics.push({ code: "second-feature", severity: "warning", message: `${file.path} has a second Feature; its rules and scenarios are read under the first`, span });
        else {
          feature = item("feature", file.path, title, span);
          const fid = fileId?.exec(file.path)?.[1];
          if (fid !== undefined) {
            feature.attrs = { ...(feature.attrs ?? {}), fileId: fid };
            byFileId.set(fid, [...(byFileId.get(fid) ?? []), file.path]);
          }
        }
        rule = undefined;
        describing = feature;
        mode = "feature";
      } else if (kw === "Rule") {
        const named = idTag === undefined ? undefined : tags.map((t) => idTag.exec(t)).find((m) => m !== null);
        const id = named !== undefined && named !== null && !taken.has(named[1] ?? named[0].slice(1)) ? (taken.add(named[1] ?? named[0].slice(1)), named[1] ?? named[0].slice(1)) : unique(`${file.path}#${slug(title)}`, taken);
        rule = item("rule", id, title, span);
        const pattern = classify(title);
        rule.pattern = pattern ?? "none";
        if (pattern === undefined) diagnostics.push({ code: "no-pattern", severity: "warning", message: `the rule "${title}" matches no EARS pattern`, span });
        ruleBackground = [];
        describing = rule;
        mode = "rule";
      } else if (kw === "Scenario" || kw === "Example" || kw === "Scenario Outline" || kw === "Scenario Template") {
        const parent = rule?.id ?? `${file.path}#`;
        const id = unique(`${parent}/${slug(title)}`, taken);
        const sc = item("scenario", id, title, span);
        const outline = kw !== "Scenario" && kw !== "Example";
        if (outline) sc.attrs = { ...(sc.attrs ?? {}), outline: "true" };
        edges.push({ from: id, rel: "exemplifies", to: rule?.id ?? feature?.id ?? file.path, span });
        open = { item: sc, background: [...featureBackground, ...ruleBackground], steps: [], outline, rows: [] };
        mode = "scenario";
      } else {
        tags = []; // Background and Examples carry tags of their own, never the next item's
        if (kw === "Background") {
          background = [];
          if (rule === undefined) featureBackground = background;
          else ruleBackground = background;
          mode = "background";
        } else if (open !== undefined) mode = "examples";
        else mode = "other";
      }
    });
    close();
    if (items.length === before) diagnostics.push({ code: "no-items", severity: "warning", message: `${file.path} has no Feature, Rule or Scenario line`, span: file.path });
  }
  for (const [fid, paths] of byFileId) {
    if (paths.length > 1) diagnostics.push({ code: "duplicate-file-id", severity: "warning", message: `${paths.length} feature files have the identity ${fid}: ${paths.join(", ")}`, span: paths[0]! });
  }
  if (input.executions === undefined) return { items, edges, diagnostics };
  // A scenario's result cites what its tags name: the rule's own identifier, what a tag cites, or the identifier pattern.
  const cite = new RegExp(`\\b(?:${[input.config?.idTag, input.config?.tagCites, idPatternOf(input)].filter((x) => x !== undefined).join("|")})\\b`, "g");
  const features = items.filter((i) => i.kind === "feature").map((i) => i.id);
  return { items, edges, diagnostics, results: joinResults(input, features, cite, diagnostics) };
}

/** Each result a runner reports of a feature file (stage 42), joined to the feature as a test's is joined to its file. */
function joinResults(input: AdapterInput, features: string[], cite: RegExp, diagnostics: Diagnostic[]): TestResult[] {
  const results: TestResult[] = [];
  let unmatched = 0;
  for (const f of input.executions ?? []) {
    const parsed = parseTestResults(decode(f.bytes));
    for (const p of parsed.problems) diagnostics.push({ code: "malformed-results", severity: "error", message: p.message, span: `${f.path}:${p.line}` });
    if (parsed.commit !== undefined && input.config?.commit !== undefined && parsed.commit !== input.config.commit) {
      diagnostics.push({ code: "results-other-commit", severity: "warning", message: `the results are of ${parsed.commit.slice(0, 7)}, not ${input.config.commit.slice(0, 7)}: none is joined`, span: f.path });
      continue;
    }
    for (const r of parsed.results) {
      const file = fileOf(r.file, features);
      if (file === undefined) {
        unmatched++;
        continue;
      }
      const cites = r.cites ?? [...new Set([...r.name.matchAll(cite)].map((m) => m[0]))].sort();
      results.push({ file, outcome: r.outcome, cites, span: /^\d+$/.test(r.at) ? `${f.path}:${r.at}` : `${f.path}#${r.at}` });
    }
  }
  if ((input.executions ?? []).length === 0) diagnostics.push({ code: "no-results", severity: "info", message: "the practice names a results file and none was found: every scenario's outcome is unknown" });
  if (unmatched > 0) diagnostics.push({ code: "results-unmatched", severity: "info", message: `${unmatched} results name no feature file of the source` });
  return results;
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
