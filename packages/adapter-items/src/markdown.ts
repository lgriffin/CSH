// The Markdown inventory adapter (Ingesting a codebase, stage 22). Each file is one document item. A heading that
// opens with an identifier is one item of kind requirement: its first paragraph is its text, the parts of the heading
// after the identifier are fields, and each "- **Name:** value" bullet under it is a field. The mechanisms the first
// sentence of its "Verified by" field names in backticks become verified-by edges; an "**Implements:**" line becomes
// implements edges from the document; any other backticked repository path becomes a mentions-file edge. It reads
// structure and never meaning: a requirement whose verification is prose alone simply has no verified-by edge.
import { classify } from "@csh/adapter-ears-markdown";
import { digestOf } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, Diagnostic, ItemEdge, SourceItem } from "@csh/witness";
import { backticked, decode, idPatternOf, pathToken, sortedFiles } from "./common.ts";

export const manifest = {
  id: "csh.adapter.items.markdown",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["items", "edges"],
  inputKinds: ["Requirements", "Documents"],
} as const;

/** A field name as an attribute key: "Verified by" becomes "verified-by". */
const key = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const plain = (s: string) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

/** The first sentence of a field's value: up to the first full stop outside backticks that ends a sentence. */
export function firstSentence(value: string): string {
  let inTick = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (c === "`") inTick = !inTick;
    else if (!inTick && c === "." && (i + 1 === value.length || /\s/.test(value[i + 1]!))) return value.slice(0, i + 1);
  }
  return value;
}

interface Open {
  item: SourceItem;
  level: number;
  paragraph: string[];
  /** Done with the first paragraph: a bullet, a blank line after text, or a sub-heading came. */
  textDone: boolean;
  field?: string;
}

export function run(input: AdapterInput): AdapterOutput {
  const idPattern = idPatternOf(input);
  const headingId = new RegExp(`^(${idPattern})(?=$|[\\s·:—–-])\\s*[·:—–-]?\\s*(.*)$`);
  const fieldNames = (input.config?.headingFields ?? "").split(",").map((s) => key(s)).filter((s) => s !== "");
  const verifiedField = key(input.config?.verifiedField ?? "Verified by");
  // "references": a heading that opens with an identifier is a section about an item another source defines, read as
  // an implements edge from the document rather than as an item of its own.
  const headingsAreItems = input.config?.headings !== "references";
  const items: SourceItem[] = [];
  const edges: ItemEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  const seen = new Map<string, string>();
  const add = (it: SourceItem): boolean => {
    const prior = seen.get(it.id);
    if (prior !== undefined) {
      diagnostics.push({ code: "duplicate-id", severity: "error", message: `${it.id} is defined at ${prior} and again here`, span: it.span });
      return false;
    }
    seen.set(it.id, it.span);
    items.push(it);
    return true;
  };
  for (const file of sortedFiles(input)) {
    if (!/\.(md|markdown)$/i.test(file.path)) continue;
    const text = decode(file.bytes);
    const lines = text.split(/\r?\n/);
    const doc: SourceItem = { id: file.path, kind: "document", text: file.path, span: `${file.path}:1`, textDigest: digestOf(text) };
    add(doc);
    let open: Open | undefined;
    let fence: string | undefined;
    const close = () => {
      if (open === undefined) return;
      const body = plain(open.paragraph.join(" "));
      if (body !== "") {
        open.item.text = body;
        open.item.textDigest = digestOf(body);
      }
      const pattern = classify(open.item.text);
      if (pattern !== undefined) open.item.pattern = pattern;
      open = undefined;
    };
    const fromId = () => open?.item.id ?? doc.id;
    lines.forEach((raw, i) => {
      const span = `${file.path}:${i + 1}`;
      const fenceMark = /^\s*(```|~~~)/.exec(raw);
      if (fenceMark !== null) {
        if (fence === undefined) fence = fenceMark[1];
        else if (fence === fenceMark[1]) fence = undefined;
        return;
      }
      if (fence !== undefined) return;
      const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
      if (h !== null) {
        const level = h[1]!.length;
        if (open !== undefined && level <= open.level) close();
        else if (open !== undefined) open.textDone = true;
        const m = headingId.exec(h[2]!);
        if (m !== null && !headingsAreItems) {
          close();
          edges.push({ from: doc.id, rel: "implements", to: m[1]!, span });
        } else if (m !== null) {
          close();
          const parts = m[2]!.split("·").map((s) => plain(s)).filter((s) => s !== "");
          const attrs: Record<string, string> = {};
          parts.forEach((p, n) => (attrs[fieldNames[n] ?? `heading-${n + 1}`] = p));
          const heading = plain(h[2]!);
          const item: SourceItem = { id: m[1]!, kind: "requirement", text: heading, span, textDigest: digestOf(heading) };
          if (parts.length > 0) item.attrs = attrs;
          if (add(item)) open = { item, level, paragraph: [], textDone: false };
        }
        return;
      }
      const line = raw.trim();
      // An Implements line names the requirements the document serves.
      const impl = /^\*\*Implements:?\*\*:?\s*(.*)$/.exec(line);
      if (impl !== null) {
        for (const id of new Set([...impl[1]!.matchAll(new RegExp(`\\b${idPattern}\\b`, "g"))].map((x) => x[0]))) edges.push({ from: doc.id, rel: "implements", to: id, span });
        return;
      }
      let mechanisms: string[] = [];
      if (open !== undefined) {
        const bullet = /^[-*+]\s+\*\*([^*]+?):?\*\*:?\s*(.*)$/.exec(line);
        if (bullet !== null) {
          open.textDone = true;
          const name = key(bullet[1]!);
          open.field = name;
          open.item.attrs = { ...(open.item.attrs ?? {}), [name]: bullet[2]! };
          if (name === verifiedField) {
            mechanisms = backticked(firstSentence(bullet[2]!));
            for (const t of mechanisms) {
              const p = pathToken(t);
              edges.push({ from: open.item.id, rel: "verified-by", to: p !== undefined ? `file:${p}` : `text:${t}`, span });
            }
          }
        } else if (line === "") {
          if (open.paragraph.length > 0) open.textDone = true;
          delete open.field;
        } else if (open.field !== undefined && /^\s/.test(raw)) {
          open.item.attrs![open.field] = `${open.item.attrs![open.field]} ${line}`;
        } else if (!open.textDone) open.paragraph.push(line);
      }
      const named = new Set(mechanisms);
      for (const t of backticked(line)) {
        if (named.has(t)) continue;
        const p = pathToken(t);
        if (p !== undefined) edges.push({ from: fromId(), rel: "mentions-file", to: `file:${p}`, span });
      }
    });
    close();
  }
  return { items, edges, diagnostics };
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
