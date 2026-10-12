// Manifest fields as facts (stage 29): the scalar leaves of a TOML manifest, such as pyproject.toml or Cargo.toml, by
// JSON pointer, as facts-ts reads package.json. A malformed manifest is a diagnostic, never a dropped file.
import { fieldsOf } from "@csh/facts-ts";
import { parse as parseToml } from "smol-toml";
import type { Diagnostic, Fact } from "@csh/witness";
import type { FactContext, InputFile } from "./run.ts";

/** The field facts of a TOML file; with `only`, of those top-level tables alone. */
export function tomlFields(f: InputFile, ctx: FactContext, tool: { id: string; version: string }, only: readonly string[] | null = null): { facts: Fact[]; diagnostics: Diagnostic[] } {
  try {
    const value = parseToml(new TextDecoder().decode(f.bytes));
    // Dates are TOML values JSON has not: written as the text TOML gave them.
    const plain = JSON.parse(JSON.stringify(value)) as unknown;
    return { facts: fieldsOf(plain, only).map((x) => ({ ...ctx.base(tool), kind: "field" as const, at: f.path, file: f.path, path: x.path, value: x.value })), diagnostics: [] };
  } catch (err) {
    return { facts: [], diagnostics: [{ code: "malformed-manifest", severity: "warning", message: (err as Error).message, span: f.path }] };
  }
}
