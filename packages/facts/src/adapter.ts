// The Facts adapter: reads csh-facts/v1 files and hands the facts to the check engine, which decides whether they are
// current. It lifts no claim: a fact is evidence and never authority.
import type { Adapter, AdapterInput, AdapterOutput, Fact } from "@csh/witness";
import { parseFacts } from "./facts.ts";

export const manifest = {
  id: "csh.adapter.facts",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["facts"],
  inputKinds: ["Facts"],
} as const;

export function readFactFiles(input: AdapterInput): AdapterOutput {
  const out: AdapterOutput = { facts: [] as Fact[], diagnostics: [] };
  for (const f of input.files) {
    const { facts, problems } = parseFacts(new TextDecoder().decode(f.bytes));
    out.facts!.push(...facts.map((x) => x.fact));
    for (const p of problems) out.diagnostics.push({ code: "malformed-fact", severity: "error", message: p.message, span: `${f.path}:${p.line}` });
  }
  return out;
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run: readFactFiles };
