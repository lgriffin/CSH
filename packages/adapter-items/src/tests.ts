// The test-file inventory adapter (Ingesting a codebase, stage 22). Each test file is one item, with the number of
// tests it declares. An identifier in the title of a describe, it or test call cites that identifier: the title is
// what the runner reports, so it is what a reader of a failure sees. Identifiers elsewhere in the file, in data or
// comments, cite nothing. The file is read as text and never run; the test runner's own results are stage 26's.
import { digestOf } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, Diagnostic, ItemEdge, SourceItem } from "@csh/witness";
import { decode, idPatternOf, sortedFiles } from "./common.ts";

export const manifest = {
  id: "csh.adapter.items.tests",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["items", "edges"],
  inputKinds: ["TestFiles"],
} as const;

/** A describe, it or test call (with any modifier such as .each or .skip) and its literal title. */
const CALL = /\b(describe|it|test)((?:\.\w+)*)\s*\(\s*(['"`])((?:\\.|(?!\3).)*)\3/g;

export function run(input: AdapterInput): AdapterOutput {
  const id = new RegExp(`\\b(?:${input.config?.citePattern ?? idPatternOf(input)})\\b`, "g");
  const items: SourceItem[] = [];
  const edges: ItemEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const file of sortedFiles(input)) {
    const text = decode(file.bytes);
    let tests = 0;
    let skipped = 0;
    const cited = new Set<string>();
    text.split(/\r?\n/).forEach((line, i) => {
      for (const m of line.matchAll(CALL)) {
        if (m[1] !== "describe") tests++;
        if (/\.(skip|todo)\b/.test(m[2]!)) skipped++;
        for (const c of m[4]!.matchAll(id)) {
          if (cited.has(c[0])) continue;
          cited.add(c[0]);
          edges.push({ from: file.path, rel: "cites", to: c[0], span: `${file.path}:${i + 1}` });
        }
      }
    });
    const attrs: Record<string, string> = { tests: String(tests) };
    if (skipped > 0) attrs.skipped = String(skipped);
    items.push({ id: file.path, kind: "test-file", text: file.path, span: `${file.path}:1`, textDigest: digestOf(text), attrs });
    if (tests === 0) diagnostics.push({ code: "no-tests", severity: "info", message: `${file.path} declares no it or test call with a literal title`, span: file.path });
  }
  return { items, edges, diagnostics };
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
