// The Gherkin inventory adapter (Ingesting a codebase, stage 22): the structure of feature files, without a step
// table. Each feature, rule and scenario is one item. A rule's title is its requirement, classified by EARS pattern;
// a scenario exemplifies the rule it sits under, or the feature when it sits under none. Tags are kept as a field, and
// a tag the practice's `tagCites` pattern matches cites the identifier its first group captures. Nothing is lifted
// to a claim and nothing is executed: lifting needs the step table, which the scenario adapter loads (A-37).
import { classify } from "@csh/adapter-ears-markdown";
import { digestOf } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, Diagnostic, ItemEdge, SourceItem } from "@csh/witness";
import { decode, slug, sortedFiles, unique } from "./common.ts";

export const manifest = {
  id: "csh.adapter.items.gherkin",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["items", "edges"],
  inputKinds: ["Features", "Scenarios"],
} as const;

const HEADER = /^(Feature|Rule|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples|Scenarios):\s*(.*)$/;

export function run(input: AdapterInput): AdapterOutput {
  const items: SourceItem[] = [];
  const edges: ItemEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  const tagCites = input.config?.tagCites !== undefined ? new RegExp(`^@${input.config.tagCites}$`) : undefined;
  for (const file of sortedFiles(input)) {
    if (!file.path.endsWith(".feature")) continue;
    const taken = new Set<string>();
    let feature: SourceItem | undefined;
    let rule: SourceItem | undefined;
    let tags: string[] = [];
    let doc: string | undefined;
    const before = items.length;
    const item = (kind: "feature" | "rule" | "scenario", id: string, title: string, span: string): SourceItem => {
      const it: SourceItem = { id, kind, text: title, span, textDigest: digestOf(title) };
      if (tags.length > 0) {
        it.attrs = { tags: tags.join(" ") };
        if (tagCites !== undefined) for (const t of tags) {
          const m = tagCites.exec(t);
          if (m !== null) edges.push({ from: id, rel: "cites", to: m[1] ?? m[0].slice(1), span });
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
      if (h === null) return;
      const kw = h[1]!;
      const title = h[2]!.trim();
      if (kw === "Feature") {
        if (feature !== undefined) diagnostics.push({ code: "second-feature", severity: "warning", message: `${file.path} has a second Feature; its rules and scenarios are read under the first`, span });
        else feature = item("feature", file.path, title, span);
        rule = undefined;
      } else if (kw === "Rule") {
        const id = unique(`${file.path}#${slug(title)}`, taken);
        rule = item("rule", id, title, span);
        const pattern = classify(title);
        rule.pattern = pattern ?? "none";
        if (pattern === undefined) diagnostics.push({ code: "no-pattern", severity: "warning", message: `the rule "${title}" matches no EARS pattern`, span });
      } else if (kw === "Scenario" || kw === "Example" || kw === "Scenario Outline" || kw === "Scenario Template") {
        const parent = rule?.id ?? `${file.path}#`;
        const id = unique(`${parent}/${slug(title)}`, taken);
        const sc = item("scenario", id, title, span);
        if (kw !== "Scenario" && kw !== "Example") sc.attrs = { ...(sc.attrs ?? {}), outline: "true" };
        edges.push({ from: id, rel: "exemplifies", to: rule?.id ?? feature?.id ?? file.path, span });
      } else tags = []; // Background and Examples carry tags of their own, never the next item's
    });
    if (items.length === before) diagnostics.push({ code: "no-items", severity: "warning", message: `${file.path} has no Feature, Rule or Scenario line`, span: file.path });
  }
  return { items, edges, diagnostics };
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
