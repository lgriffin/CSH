// The issue inventory adapter (Ingesting a codebase, stage 22): an issue tracker exported as JSON lines, one issue per
// line, such as a beads export. Each issue is one item, with its status, priority and type as fields. An identifier in
// its title, description or notes is a mention: it counts when it names an item, and a mention that names nothing is
// not reported, since free text names many things that are not requirements.
import { digestOf } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, Diagnostic, ItemEdge, SourceItem } from "@csh/witness";
import { decode, idPatternOf, sortedFiles } from "./common.ts";

export const manifest = {
  id: "csh.adapter.items.jsonl",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["items", "edges"],
  inputKinds: ["Issues"],
} as const;

const FIELDS = ["status", "priority", "issue_type", "closed_at", "updated_at"] as const;

export function run(input: AdapterInput): AdapterOutput {
  const id = new RegExp(`\\b(?:${idPatternOf(input)})\\b`, "g");
  const items: SourceItem[] = [];
  const edges: ItemEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const file of sortedFiles(input)) {
    if (!/\.(jsonl|ndjson)$/.test(file.path)) continue;
    const before = items.length + diagnostics.length;
    decode(file.bytes).split(/\r?\n/).forEach((line, i) => {
      if (line.trim() === "") return;
      const span = `${file.path}:${i + 1}`;
      let v: Record<string, unknown>;
      try {
        v = JSON.parse(line) as Record<string, unknown>;
      } catch (err) {
        diagnostics.push({ code: "malformed-line", severity: "warning", message: (err as Error).message, span });
        return;
      }
      if (typeof v.id !== "string" || v.id === "") {
        diagnostics.push({ code: "malformed-line", severity: "warning", message: "the line has no id", span });
        return;
      }
      if (seen.has(v.id)) {
        diagnostics.push({ code: "duplicate-id", severity: "error", message: `${v.id} appears twice`, span });
        return;
      }
      seen.add(v.id);
      const title = typeof v.title === "string" ? v.title : "";
      const attrs: Record<string, string> = {};
      for (const f of FIELDS) if (v[f] !== undefined && v[f] !== null) attrs[f.replace("_", "-")] = String(v[f]);
      items.push({ id: v.id, kind: "issue", text: title, span, textDigest: digestOf(line), attrs });
      const prose = ["title", "description", "notes", "close_reason"].map((k) => (typeof v[k] === "string" ? (v[k] as string) : "")).join("\n");
      for (const to of new Set([...prose.matchAll(id)].map((m) => m[0]))) edges.push({ from: v.id, rel: "mentions", to, span });
    });
    // A declared source that reads as nothing is said so: an empty issue list is not a clean one.
    if (items.length + diagnostics.length === before) diagnostics.push({ code: "no-items", severity: "warning", message: `${file.path} holds no lines`, span: file.path });
  }
  return { items, edges, diagnostics };
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
