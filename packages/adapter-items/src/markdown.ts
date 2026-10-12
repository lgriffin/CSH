// The Markdown inventory adapter (Ingesting a codebase, stage 22). Each file is one document item. A heading that
// opens with an identifier is one item of kind requirement: its first paragraph is its text, the parts of the heading
// after the identifier are fields, and each "- **Name:** value" bullet under it is a field. The mechanisms the first
// sentence of its "Verified by" field names in backticks become verified-by edges; an "**Implements:**" line becomes
// implements edges from the document; any other backticked repository path, or bare code file name (stage 25), becomes
// a mentions-file edge. It reads
// structure and never meaning: a requirement whose verification is prose alone simply has no verified-by edge.
import { classify } from "@csh/adapter-ears-markdown";
import { digestOf } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, Diagnostic, ItemEdge, SourceItem } from "@csh/witness";
import { backticked, bareFileToken, decode, idPatternOf, pathToken, sortedFiles } from "./common.ts";

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

const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|pyi|java|go|rs)$/;

export function run(input: AdapterInput): AdapterOutput {
  const idPattern = idPatternOf(input);
  const headingId = new RegExp(`^(?<id>(?:${idPattern}))(?=$|[\\s·:—–-])\\s*[·:—–-]?\\s*(?<rest>.*)$`);
  const anyId = new RegExp(`\\b(?:${idPattern})\\b`, "g");
  const fieldNames = (input.config?.headingFields ?? "").split(",").map((s) => key(s)).filter((s) => s !== "");
  const verifiedField = key(input.config?.verifiedField ?? "Verified by");
  // "references": a heading that opens with an identifier is a section about an item another source defines, read as
  // an implements edge from the document rather than as an item of its own.
  const headingsAreItems = input.config?.headings !== "references";
  // A table row whose first cell is an identifier defines a requirement: `| ING-001 | Event | When ..., the system shall ... |`.
  // The sentence is the first cell that says shall (a pattern or status column often sits between), else the first cell.
  const tableId = new RegExp(`^\\|\\s*(${idPattern})\\s*\\|`);
  const tableCells = (row: string): string[] => row.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => plain(c));
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
    // The open fence's character and length: only a fence of the same character, at least as long, closes it.
    let fence: { char: string; length: number } | undefined;
    // The Verified by field being read: its mechanisms are the first sentence of the whole value, which may run on to
    // indented lines, so its edges are made once the field ends.
    let verifying: { item: SourceItem; value: string; tokens: { t: string; span: string }[] } | undefined;
    const endField = () => {
      if (verifying === undefined) return;
      const mechanisms = new Set(backticked(firstSentence(verifying.value)));
      const made = new Set<string>();
      for (const { t, span } of verifying.tokens) {
        if (mechanisms.has(t) && !made.has(t)) {
          made.add(t);
          const p = pathToken(t) ?? bareFileToken(t);
          edges.push({ from: verifying.item.id, rel: "verified-by", to: p !== undefined ? `file:${p}` : `text:${t}`, span });
        } else if (!mechanisms.has(t)) {
          const p = pathToken(t) ?? bareFileToken(t);
          if (p !== undefined) edges.push({ from: verifying.item.id, rel: "mentions-file", to: `file:${p}`, span });
        }
      }
      verifying = undefined;
    };
    // A symbol beside a code path ("`buildError` in `src/core/util/error.ts`") says the file declares it, and `npm run x`
    // says the script exists (stage 24). Only these two shapes are read: a symbol elsewhere on the line is not.
    const codeMentions = (text: string, from: string, span: string) => {
      const sym = "([A-Za-z_$][\\w$]*)(?:\\(\\))?";
      for (const m of text.matchAll(new RegExp(`\`${sym}\`\\s+(?:in|from|of|exported by|declared in)\\s+\`([^\`]+)\``, "g"))) {
        const p = pathToken(m[2]!);
        if (p !== undefined && CODE_FILE.test(p)) edges.push({ from, rel: "mentions-symbol", to: `symbol:${p}#${m[1]}`, span });
      }
      for (const m of text.matchAll(new RegExp(`\`([^\`]+)\`\\s+(?:exports|declares|defines)\\s+\`${sym}\``, "g"))) {
        const p = pathToken(m[1]!);
        if (p !== undefined && CODE_FILE.test(p)) edges.push({ from, rel: "mentions-symbol", to: `symbol:${p}#${m[2]}`, span });
      }
      for (const t of backticked(text)) {
        // The name ends the token or a word: `npm run test:<name>` is a pattern of names, not a script.
        const s = /^npm run ([\w:.\-]+)(?=$|\s)/.exec(t);
        if (s !== null) edges.push({ from, rel: "mentions-script", to: `script:${s[1]}`, span });
      }
    };
    const mentions = (text: string, from: string, span: string) => {
      for (const t of backticked(text)) {
        const p = pathToken(t) ?? bareFileToken(t);
        if (p !== undefined) edges.push({ from, rel: "mentions-file", to: `file:${p}`, span });
      }
    };
    const close = () => {
      endField();
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
      const fenceMark = /^\s*(`{3,}|~{3,})(.*)$/.exec(raw);
      if (fenceMark !== null) {
        const mark = fenceMark[1]!;
        if (fence === undefined) {
          endField();
          fence = { char: mark[0]!, length: mark.length };
        } else if (mark[0] === fence.char && mark.length >= fence.length && fenceMark[2]!.trim() === "") fence = undefined;
        return;
      }
      if (fence !== undefined) return;
      const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
      if (h !== null) {
        const level = h[1]!.length;
        if (open !== undefined && level <= open.level) close();
        else if (open !== undefined) open.textDone = true;
        endField();
        const m = headingId.exec(h[2]!);
        if (m !== null && !headingsAreItems) {
          close();
          edges.push({ from: doc.id, rel: "implements", to: m.groups!.id!, span });
        } else if (m !== null) {
          close();
          const parts = m.groups!.rest!.split("·").map((s) => plain(s)).filter((s) => s !== "");
          const attrs: Record<string, string> = {};
          parts.forEach((p, n) => (attrs[fieldNames[n] ?? `heading-${n + 1}`] = p));
          const heading = plain(h[2]!);
          const item: SourceItem = { id: m.groups!.id!, kind: "requirement", text: heading, span, textDigest: digestOf(heading) };
          if (parts.length > 0) item.attrs = attrs;
          if (add(item)) open = { item, level, paragraph: [], textDone: false };
        }
        mentions(h[2]!, fromId(), span);
        codeMentions(h[2]!, fromId(), span);
        return;
      }
      const row = headingsAreItems ? tableId.exec(raw.trim()) : null;
      if (row !== null) {
        endField();
        close();
        const cells = tableCells(raw.trim()).slice(1);
        const text = cells.find((c) => /\bshall\b/i.test(c)) ?? cells[0] ?? "";
        const item: SourceItem = { id: row[1]!, kind: "requirement", text, span, textDigest: digestOf(text) };
        const pattern = classify(text);
        if (pattern !== undefined) item.pattern = pattern;
        add(item);
        mentions(raw, row[1]!, span);
        codeMentions(raw, row[1]!, span);
        return;
      }
      const line = raw.trim();
      // An Implements line names the requirements the document serves.
      const impl = /^\*\*Implements:?\*\*:?\s*(.*)$/.exec(line);
      if (impl !== null) {
        endField();
        for (const id of new Set([...impl[1]!.matchAll(anyId)].map((x) => x[0]))) edges.push({ from: doc.id, rel: "implements", to: id, span });
        return;
      }
      if (open !== undefined) {
        const bullet = /^[-*+]\s+\*\*([^*]+?):?\*\*:?\s*(.*)$/.exec(line);
        if (bullet !== null) {
          endField();
          open.textDone = true;
          const name = key(bullet[1]!);
          open.field = name;
          open.item.attrs = { ...(open.item.attrs ?? {}), [name]: bullet[2]! };
          if (name === verifiedField) verifying = { item: open.item, value: bullet[2]!, tokens: [] };
        } else if (line === "") {
          endField();
          if (open.paragraph.length > 0) open.textDone = true;
          delete open.field;
        } else if (open.field !== undefined && /^\s/.test(raw)) {
          open.item.attrs![open.field] = `${open.item.attrs![open.field]} ${line}`;
          if (verifying !== undefined) verifying.value = `${verifying.value} ${line}`;
        } else {
          endField();
          if (!open.textDone) open.paragraph.push(line);
        }
      }
      if (verifying !== undefined) for (const t of backticked(line)) verifying.tokens.push({ t, span });
      else mentions(line, fromId(), span);
      codeMentions(line, verifying?.item.id ?? fromId(), span);
    });
    close();
  }
  return { items, edges, diagnostics };
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
