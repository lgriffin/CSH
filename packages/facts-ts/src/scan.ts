// facts-ts: code facts read from TypeScript and JavaScript source files, as csh-facts/v2 (Ingesting a codebase, stage
// 23). It is an adapter: it sees only the bytes of the files its source names, parses each one alone with the
// TypeScript parser, and resolves relative imports against those same files. Nothing is installed, compiled or type
// checked, so the facts of a commit depend on its source files alone, never on a lockfile or node_modules.
//
// Facts: one module per file; one dependency per import, re-export, import-equals, literal dynamic import and literal
// require, to the module it resolves to or to the package a bare specifier names; one export per exported name; and
// the fields of a package.json that say what the package is. A relative specifier that resolves to no file is a
// skipped fact, never dropped.
import { builtinModules } from "node:module";
import { posix } from "node:path";
import ts from "typescript";
import { compareCodePoints } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, Diagnostic, Fact } from "@csh/witness";

export const TOOL = { id: "facts-ts", version: "0.1.0" } as const;
export const SCHEMA = "csh-facts/v2";
const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const BUILTIN = new Set(builtinModules);
/** The package.json fields read as facts: what the package is called, its version, its entry points and its floor. */
const FIELDS = ["name", "version", "type", "main", "types", "engines", "exports", "bin"];

export const manifest = {
  id: "csh.adapter.facts-ts",
  version: TOOL.version,
  ir: "csh-ir/v1",
  produces: ["facts"],
  inputKinds: ["Code"],
} as const;

/** The package a bare specifier names: "@scope/name" or "name", and "node:fs" for a built-in however it is written. */
export function packageOf(specifier: string): string {
  if (specifier.startsWith("node:")) return `node:${specifier.slice(5).split("/")[0]}`;
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
  return BUILTIN.has(name) ? `node:${name}` : name;
}

/** The file a relative specifier lands on, among `files`, as TypeScript's bundler resolution would find it. */
export function resolveRelative(fromFile: string, specifier: string, files: Set<string>): string | undefined {
  const base = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  const stem = base.replace(/\.(js|jsx|mjs|cjs)$/, "");
  const ext = base.match(/\.(m|c)?js$/)?.[1];
  const candidates = [
    base,
    ...(ext === "m" ? [`${stem}.mts`] : ext === "c" ? [`${stem}.cts`] : [`${stem}.ts`, `${stem}.tsx`]),
    `${stem}.d.ts`,
    ...["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "d.ts"].map((e) => `${base}.${e}`),
    ...["ts", "tsx", "js", "jsx", "mjs", "d.ts"].map((e) => `${base}/index.${e}`),
  ];
  return candidates.find((c) => files.has(c));
}

interface Reference {
  specifier: string;
  line: number;
  typeOnly: boolean;
}

const lineOf = (sf: ts.SourceFile, node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
const literal = (n: ts.Node | undefined): string | undefined => (n !== undefined && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined);
const hasExport = (n: ts.Node) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const hasDefault = (n: ts.Node) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

/** Every module reference and every exported name of one file. */
export function readFile(path: string, text: string): { refs: Reference[]; exports: { symbol: string; from?: string; typeOnly: boolean }[]; computed: number[] } {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : path.endsWith(".jsx") ? ts.ScriptKind.JSX : /\.(js|mjs|cjs)$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const refs: Reference[] = [];
  const exports: { symbol: string; from?: string; typeOnly: boolean }[] = [];
  const computed: number[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n)) {
      const spec = literal(n.moduleSpecifier);
      const c = n.importClause;
      const typeOnly = c !== undefined && (c.isTypeOnly || (c.name === undefined && c.namedBindings !== undefined && ts.isNamedImports(c.namedBindings) && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly)));
      if (spec !== undefined) refs.push({ specifier: spec, line: lineOf(sf, n), typeOnly });
    } else if (ts.isExportDeclaration(n)) {
      const spec = literal(n.moduleSpecifier);
      if (spec !== undefined) refs.push({ specifier: spec, line: lineOf(sf, n), typeOnly: n.isTypeOnly });
      const from = spec !== undefined ? { from: spec } : {};
      if (n.exportClause === undefined) exports.push({ symbol: "*", ...from, typeOnly: n.isTypeOnly });
      else if (ts.isNamespaceExport(n.exportClause)) exports.push({ symbol: n.exportClause.name.text, ...from, typeOnly: n.isTypeOnly });
      else for (const e of n.exportClause.elements) exports.push({ symbol: e.name.text, ...from, typeOnly: n.isTypeOnly || e.isTypeOnly });
    } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) {
      const spec = literal(n.moduleReference.expression);
      if (spec !== undefined) refs.push({ specifier: spec, line: lineOf(sf, n), typeOnly: n.isTypeOnly });
    } else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))) {
      const spec = literal(n.arguments[0]);
      if (spec !== undefined) refs.push({ specifier: spec, line: lineOf(sf, n), typeOnly: false });
      else if (n.arguments.length > 0) computed.push(lineOf(sf, n));
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) {
      const spec = literal(n.argument.literal);
      if (spec !== undefined) refs.push({ specifier: spec, line: lineOf(sf, n), typeOnly: true });
    } else if (ts.isExportAssignment(n)) {
      exports.push({ symbol: n.isExportEquals === true ? "export=" : "default", typeOnly: false });
    } else if (n.parent === sf && hasExport(n)) {
      const typeOnly = ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n);
      if (hasDefault(n)) exports.push({ symbol: "default", typeOnly });
      else if (ts.isVariableStatement(n)) {
        for (const d of n.declarationList.declarations) for (const name of bindingNames(d.name)) exports.push({ symbol: name, typeOnly: false });
      } else {
        const name = (n as { name?: ts.Node }).name;
        if (name !== undefined && ts.isIdentifier(name)) exports.push({ symbol: name.text, typeOnly });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { refs, exports, computed };
}

function bindingNames(n: ts.BindingName): string[] {
  if (ts.isIdentifier(n)) return [n.text];
  return n.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : bindingNames(e.name)));
}

/** The scalar leaves of the package.json fields that say what the package is, by JSON pointer. */
export function fieldsOf(json: unknown): { path: string; value: string }[] {
  const out: { path: string; value: string }[] = [];
  const esc = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");
  const walk = (v: unknown, path: string) => {
    if (v === null || typeof v !== "object") out.push({ path, value: String(v) });
    else for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${path}/${esc(k)}`);
  };
  if (typeof json === "object" && json !== null) for (const k of FIELDS) if ((json as Record<string, unknown>)[k] !== undefined) walk((json as Record<string, unknown>)[k], `/${k}`);
  return out;
}

export function run(input: AdapterInput): AdapterOutput {
  const commit = input.config?.commit ?? "unknown";
  const base = { schema: SCHEMA, subject: { commit }, tool: { id: TOOL.id, version: TOOL.version } } as const;
  const facts: Fact[] = [];
  const diagnostics: Diagnostic[] = [];
  const files = [...input.files].sort((a, b) => compareCodePoints(a.path, b.path));
  const code = new Set(files.filter((f) => CODE.test(f.path)).map((f) => f.path));
  if (input.config?.commit === undefined) diagnostics.push({ code: "no-commit", severity: "warning", message: "the harness gave no commit, so these facts are never current" });
  for (const f of files) {
    const text = new TextDecoder().decode(f.bytes);
    if (posix.basename(f.path) === "package.json") {
      try {
        for (const x of fieldsOf(JSON.parse(text))) facts.push({ ...base, kind: "field", at: f.path, file: f.path, path: x.path, value: x.value });
      } catch (err) {
        diagnostics.push({ code: "malformed-manifest", severity: "warning", message: (err as Error).message, span: f.path });
      }
      continue;
    }
    if (!code.has(f.path)) continue;
    facts.push({ ...base, kind: "module", at: f.path, name: f.path });
    const r = readFile(f.path, text);
    for (const ref of r.refs) {
      const at = `${f.path}:${ref.line}`;
      if (ref.specifier.startsWith(".")) {
        const to = resolveRelative(f.path, ref.specifier, code);
        if (to === undefined) facts.push({ ...base, kind: "skipped", at, from: f.path, reason: `unresolved ${ref.specifier}` });
        else if (to !== f.path) facts.push({ ...base, kind: "depends", at, from: f.path, to, via: "import", typeOnly: ref.typeOnly });
      } else facts.push({ ...base, kind: "depends", at, from: f.path, to: packageOf(ref.specifier), via: "import", typeOnly: ref.typeOnly });
    }
    for (const line of r.computed) facts.push({ ...base, kind: "skipped", at: `${f.path}:${line}`, from: f.path, reason: "computed specifier" });
    for (const e of r.exports) facts.push({ ...base, kind: "export", at: f.path, module: f.path, symbol: e.symbol, ...(e.from !== undefined ? { from: e.from } : {}), typeOnly: e.typeOnly });
  }
  return { facts, diagnostics };
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
