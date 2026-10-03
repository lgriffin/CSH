// Step 1 of emission: type-check a specification file with the TypeScript compiler in strict mode.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export interface CompileDiagnostic {
  file: string;
  line: number;
  code: number;
  message: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");

export const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2023,
  lib: ["lib.es2023.d.ts"],
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  allowImportingTsExtensions: true,
  noEmit: true,
  verbatimModuleSyntax: true,
  isolatedModules: true,
  skipLibCheck: true,
  types: ["node"],
  typeRoots: [join(repo, "node_modules", "@types")],
};

let previous: ts.Program | undefined;

export function typeCheck(file: string): CompileDiagnostic[] {
  const abs = resolve(file);
  if (!existsSync(abs)) return [{ file: abs, line: 0, code: 0, message: `no such file ${abs}` }];
  const program = ts.createProgram({ rootNames: [abs], options: COMPILER_OPTIONS, ...(previous !== undefined ? { oldProgram: previous } : {}) });
  previous = program;
  const diags = ts.getPreEmitDiagnostics(program);
  return diags.map((d) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    if (d.file === undefined || d.start === undefined) return { file: "", line: 0, code: d.code, message };
    const { line } = d.file.getLineAndCharacterOfPosition(d.start);
    return { file: d.file.fileName, line: line + 1, code: d.code, message };
  });
}
