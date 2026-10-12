// facts-code: the adapter for sources of kind Code (stage 29). It hands each file to the reader of its language:
// TypeScript, JavaScript and the JSON and YAML files beside them to facts-ts, unchanged, and every other language to a
// reader registered here, which also reads the manifests of its language. A source file in a language with no reader
// is a skipped fact naming the language. Every reader sees only the bytes of the files the source names.
import { compareCodePoints } from "@csh/kernel";
import { run as runTs } from "@csh/facts-ts";
import type { Adapter, AdapterInput, AdapterOutput, Diagnostic, Fact } from "@csh/witness";
import { languageOf } from "./languages.ts";

export const TOOL = { id: "facts-code", version: "0.1.0" } as const;
export const SCHEMA = "csh-facts/v2";

export const manifest = {
  id: "csh.adapter.facts-code",
  version: TOOL.version,
  ir: "csh-ir/v1",
  produces: ["facts"],
  inputKinds: ["Code"],
} as const;

export type InputFile = AdapterInput["files"][number];

/** The fields every fact a reader writes starts with. */
export interface FactContext {
  commit: string;
  base(tool: { id: string; version: string }): { schema: typeof SCHEMA; subject: { commit: string }; tool: { id: string; version: string } };
}

/** The reader of one language: its code files, and the manifest files it reads fields of. */
export interface LanguageReader {
  language: string;
  /** Whether the reader reads a file that is not code in its language, such as its manifests. */
  manifest(path: string): boolean;
  read(files: readonly InputFile[], ctx: FactContext): Promise<{ facts: Fact[]; diagnostics: Diagnostic[] }>;
}

/** The readers, by language. Stages 31 to 34 add Python, Java, Go and Rust. */
export const READERS: LanguageReader[] = [];

export async function run(input: AdapterInput, readers: readonly LanguageReader[] = READERS): Promise<AdapterOutput> {
  const commit = input.config?.commit ?? "unknown";
  const ctx: FactContext = { commit, base: (tool) => ({ schema: SCHEMA, subject: { commit }, tool: { id: tool.id, version: tool.version } }) };
  const files = [...input.files].sort((a, b) => compareCodePoints(a.path, b.path));
  const byLanguage = new Map(readers.map((r) => [r.language, r]));
  const mine = new Map<LanguageReader, InputFile[]>(readers.map((r) => [r, []]));
  const ts: InputFile[] = [];
  const facts: Fact[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const f of files) {
    const language = languageOf(f.path);
    const reader = language !== undefined ? byLanguage.get(language) : readers.find((r) => r.manifest(f.path));
    if (reader !== undefined) mine.get(reader)!.push(f);
    else if (language !== undefined) facts.push({ ...ctx.base(TOOL), kind: "skipped", at: f.path, from: f.path, reason: `no reader for ${language}` });
    else ts.push(f);
  }
  // facts-ts warns when no commit is given; its diagnostics stand for every reader's.
  const t = runTs({ ...input, files: ts });
  facts.push(...(t.facts ?? []));
  diagnostics.push(...t.diagnostics);
  for (const r of readers) {
    const own = mine.get(r)!;
    if (own.length === 0) continue;
    const out = await r.read(own, ctx);
    facts.push(...out.facts);
    diagnostics.push(...out.diagnostics);
  }
  return { facts, diagnostics };
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run: (input) => run(input) };
