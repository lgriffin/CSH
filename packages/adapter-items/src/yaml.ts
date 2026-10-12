// The structured trace adapter (Ingesting a codebase, stage 28): a YAML or JSON file that lists entries, such as the
// properties of a security model, each with an identifier, the files and requirements it names, and possibly a field
// that records a deliberate silence with its reason. The mapping is the practice's: which list holds the entries,
// which fields are edges and of what relation, and which field records a silence. Nothing is lifted.
import { digestOf } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, Diagnostic, EdgeRel, ItemEdge, SourceItem } from "@csh/witness";
import { bareFileToken, decode, pathToken, sortedFiles } from "./common.ts";

export const manifest = {
  id: "csh.adapter.items.yaml",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["items", "edges"],
  inputKinds: ["Traces"],
} as const;

import { LINES, parseYaml, type Value } from "@csh/witness";
export { parseYaml };

const isMap = (v: Value | undefined): v is { [k: string]: Value } => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: Value | undefined): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

const RELS = new Set<EdgeRel>(["implements", "verified-by", "cites", "mentions"]);

/** `tests=verified-by charter=implements`: field and relation pairs; a relation this adapter cannot state is skipped. */
function pairs(setting: string | undefined): [string, EdgeRel][] {
  return (setting ?? "").split(/\s+/).filter((x) => x.includes("=")).map((x) => x.split("=", 2) as [string, string]).filter((p): p is [string, EdgeRel] => RELS.has(p[1] as EdgeRel));
}

export function run(input: AdapterInput): AdapterOutput {
  const collection = input.config?.collection ?? "properties";
  const idField = input.config?.idField ?? "id";
  const textField = input.config?.textField ?? "claim";
  const edgeFields = pairs(input.config?.edges ?? "tests=verified-by");
  const fields = (input.config?.fields ?? "").split(/\s+/).filter((x) => x !== "");
  // `rule=none:rule_reason`: the field that records a silence, the value that says so, and the field holding why.
  const silence = /^([\w-]+)=([^:]+):([\w-]+)$/.exec(input.config?.silence ?? "");
  const items: SourceItem[] = [];
  const edges: ItemEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const file of sortedFiles(input)) {
    if (!/\.(ya?ml|json)$/.test(file.path)) continue;
    const text = decode(file.bytes);
    const parsed = parseYaml(text);
    for (const p of parsed.problems) diagnostics.push({ code: "malformed-yaml", severity: "warning", message: p.message, span: `${file.path}:${p.line}` });
    const list = isMap(parsed.value) ? parsed.value[collection] : undefined;
    if (!Array.isArray(list)) {
      diagnostics.push({ code: "no-items", severity: "warning", message: `no list named ${collection}`, span: `${file.path}:1` });
      continue;
    }
    for (const entry of list) {
      if (!isMap(entry)) continue;
      const line = LINES.get(entry) ?? 1;
      const span = `${file.path}:${line}`;
      const id = entry[idField];
      if (typeof id !== "string" || id === "") {
        diagnostics.push({ code: "malformed-entry", severity: "warning", message: `an entry has no ${idField}`, span });
        continue;
      }
      if (seen.has(id)) {
        diagnostics.push({ code: "duplicate-id", severity: "error", message: `${id} appears twice`, span });
        continue;
      }
      seen.add(id);
      const said = entry[textField];
      const attrs: Record<string, string> = {};
      for (const f of fields) if (entry[f] !== undefined && entry[f] !== null && !isMap(entry[f])) attrs[f] = Array.isArray(entry[f]) ? strings(entry[f]).join(" ") : String(entry[f]);
      if (silence !== null && String(entry[silence[1]!]) === silence[2]) {
        const why = entry[silence[3]!];
        attrs.silence = silence[1]!;
        attrs["silence-reason"] = typeof why === "string" && why.trim() !== "" ? "stated" : "none";
      }
      items.push({ id, kind: "property", text: typeof said === "string" ? said : "", span, textDigest: digestOf(JSON.stringify(entry)), ...(Object.keys(attrs).length > 0 ? { attrs } : {}) });
      for (const [field, rel] of edgeFields) {
        for (const to of strings(entry[field])) {
          const path = pathToken(to) ?? bareFileToken(to);
          edges.push({ from: id, rel, to: path !== undefined ? `file:${path}` : to, span });
        }
      }
    }
  }
  return { items, edges, diagnostics };
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
