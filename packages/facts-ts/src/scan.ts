// facts-ts: code facts read from TypeScript and JavaScript source files, as csh-facts/v2 (Ingesting a codebase, stage
// 23). It is an adapter: it sees only the bytes of the files its source names, parses each one alone with the
// TypeScript parser, and resolves relative imports against those same files. Nothing is installed, compiled or type
// checked, so the facts of a commit depend on its source files alone, never on a lockfile or node_modules.
//
// Facts: one module per file; one dependency per import, re-export, import-equals, literal dynamic import and literal
// require, to the module it resolves to or to the package a bare specifier names; one export per exported name; one
// declaration per top-level name, with the class it extends and a constant's literal value (stage 24); the fields of
// a package.json that say what the package is, and its scripts; and every value of any other JSON file the source
// names, such as generated metrics. A relative specifier that resolves to no file is a skipped fact, never dropped.
import { builtinModules } from "node:module";
import { posix } from "node:path";
import ts from "typescript";
import { compareCodePoints } from "@csh/kernel";
import { parseYaml, type Adapter, type AdapterInput, type AdapterOutput, type Diagnostic, type Fact } from "@csh/witness";

export const TOOL = { id: "facts-ts", version: "0.1.0" } as const;
export const SCHEMA = "csh-facts/v2";
const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|svelte)$/;
const BUILTIN = new Set(builtinModules);
/** The package.json fields read as facts: what the package is called, its version, its entry points and its floor. */
const FIELDS = ["name", "version", "type", "main", "types", "engines", "exports", "bin", "scripts"];

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
    ...(ext === "m" ? [`${stem}.d.mts`] : ext === "c" ? [`${stem}.d.cts`] : [`${stem}.d.ts`]),
    ...["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "svelte", "d.ts", "d.mts", "d.cts"].map((e) => `${base}.${e}`),
    ...["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "svelte", "d.ts", "d.mts", "d.cts"].map((e) => `${base}/index.${e}`),
  ];
  return candidates.find((c) => files.has(c));
}

/**
 * The script of a Svelte component, kept at its own lines: every character outside a `<script>` element becomes a space
 * (a newline stays), so a line number in the result is a line number in the component. The markup holds no imports.
 */
export function svelteScript(text: string): string {
  const keep = new Array<boolean>(text.length).fill(false);
  for (const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const start = m.index + m[0].indexOf(">") + 1;
    for (let i = start; i < start + m[1]!.length; i++) keep[i] = true;
  }
  return [...text].map((c, i) => (keep[i] === true || c === "\n" || c === "\r" ? c : " ")).join("");
}

/**
 * The workspace packages the source's package.json files name, by package name to the directory that holds it. With
 * fewer than two there is no workspace, and a package's own name is left as a package. The sets are derived from the
 * files read, so the facts of a commit still depend on its source files alone.
 */
export function workspacePackages(files: readonly { path: string; bytes: Uint8Array }[]): Map<string, { dir: string; entries: string[] }> {
  const found = new Map<string, { dir: string; entries: string[] }>();
  for (const f of files) {
    if (posix.basename(f.path) !== "package.json" || f.path.includes("node_modules/")) continue;
    try {
      const j = JSON.parse(new TextDecoder().decode(f.bytes)) as Record<string, unknown>;
      if (typeof j.name !== "string") continue;
      const dir = posix.dirname(f.path) === "." ? "" : posix.dirname(f.path);
      const entries: string[] = [];
      const ex = j.exports;
      const dot = typeof ex === "string" ? ex : typeof ex === "object" && ex !== null ? (ex as Record<string, unknown>)["."] : undefined;
      for (const c of [typeof dot === "string" ? dot : typeof dot === "object" && dot !== null ? Object.values(dot as Record<string, unknown>).find((v) => typeof v === "string") : undefined, j.types, j.module, j.main]) if (typeof c === "string") entries.push(c);
      found.set(j.name, { dir, entries });
    } catch {
      // A malformed package.json is reported where its fields are read.
    }
  }
  return found.size >= 2 ? found : new Map();
}

/** The module a bare specifier of a workspace package lands on: its entry point, or the subpath under its src or root. */
export function resolveWorkspace(specifier: string, packages: Map<string, { dir: string; entries: string[] }>, files: Set<string>): string | undefined {
  const name = packageOf(specifier);
  const pkg = packages.get(name);
  if (pkg === undefined) return undefined;
  const sub = specifier.slice(name.length).replace(/^\//, "");
  const at = (rel: string) => (pkg.dir === "" ? rel : `${pkg.dir}/${rel}`);
  const tries = sub !== "" ? [sub, `src/${sub}`] : [...pkg.entries.map((e) => e.replace(/^\.\//, "").replace(/^(dist|lib|build)\//, "src/")), "src/index", "index"];
  for (const t of tries) {
    const found = resolveRelative("/", `./${at(t)}`.replace(/^\.\/\//, "./"), new Set([...files].map((f) => `/${f}`)));
    if (found !== undefined) return found.slice(1);
  }
  return undefined;
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

export interface Declaration {
  symbol: string;
  declares: "class" | "function" | "const" | "let" | "var" | "interface" | "type" | "enum" | "namespace";
  line: number;
  base?: string;
  value?: string;
}

/** A literal's value as text: a string, a number, a boolean, or one of these with `as const`. */
function literalValue(n: ts.Expression | undefined): string | undefined {
  if (n === undefined) return undefined;
  if (ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isParenthesizedExpression(n)) return literalValue(n.expression);
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isNumericLiteral(n)) return String(Number(n.text));
  if (n.kind === ts.SyntaxKind.TrueKeyword) return "true";
  if (n.kind === ts.SyntaxKind.FalseKeyword) return "false";
  return undefined;
}

/** The names a file declares at its top level. */
function declarationsOf(sf: ts.SourceFile): Declaration[] {
  const out: Declaration[] = [];
  for (const n of sf.statements) {
    const line = lineOf(sf, n);
    if (ts.isClassDeclaration(n)) {
      const heritage = n.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression;
      const symbol = n.name?.text ?? (hasDefault(n) ? "default" : undefined);
      if (symbol !== undefined) out.push({ symbol, declares: "class", line, ...(heritage !== undefined ? { base: heritage.getText(sf) } : {}) });
    } else if (ts.isFunctionDeclaration(n)) {
      const symbol = n.name?.text ?? (hasDefault(n) ? "default" : undefined);
      if (symbol !== undefined) out.push({ symbol, declares: "function", line });
    } else if (ts.isVariableStatement(n)) {
      const flags = n.declarationList.flags;
      const declares = flags & ts.NodeFlags.Const ? "const" : flags & ts.NodeFlags.Let ? "let" : "var";
      for (const d of n.declarationList.declarations) {
        const value = declares === "const" && ts.isIdentifier(d.name) ? literalValue(d.initializer) : undefined;
        for (const symbol of bindingNames(d.name)) out.push({ symbol, declares, line, ...(value !== undefined ? { value } : {}) });
      }
    } else if (ts.isInterfaceDeclaration(n)) out.push({ symbol: n.name.text, declares: "interface", line });
    else if (ts.isTypeAliasDeclaration(n)) out.push({ symbol: n.name.text, declares: "type", line });
    else if (ts.isEnumDeclaration(n)) out.push({ symbol: n.name.text, declares: "enum", line });
    else if (ts.isModuleDeclaration(n) && ts.isIdentifier(n.name)) out.push({ symbol: n.name.text, declares: "namespace", line });
  }
  return out;
}

/** Every module reference, exported name and top-level declaration of one file. */
export function readFile(path: string, text: string): { refs: Reference[]; exports: { symbol: string; from?: string; typeOnly: boolean }[]; computed: number[]; declarations: Declaration[] } {
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
  return { refs, exports, computed, declarations: declarationsOf(sf) };
}

function bindingNames(n: ts.BindingName): string[] {
  if (ts.isIdentifier(n)) return [n.text];
  return n.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : bindingNames(e.name)));
}

/** The scalar leaves of a JSON value by JSON pointer: of package.json, only the fields that say what the package is;
 * with `only` null, every leaf. */
export function fieldsOf(json: unknown, only: readonly string[] | null = FIELDS): { path: string; value: string }[] {
  const out: { path: string; value: string }[] = [];
  const esc = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");
  const walk = (v: unknown, path: string) => {
    if (v === null || typeof v !== "object") out.push({ path, value: String(v) });
    // An empty object or array is a leaf of its own, so its key still counts in its parent.
    else if (Object.keys(v).length === 0) out.push({ path, value: Array.isArray(v) ? "[]" : "{}" });
    else for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${path}/${esc(k)}`);
  };
  if (only === null) walk(json, "");
  else if (typeof json === "object" && json !== null) for (const k of only) if ((json as Record<string, unknown>)[k] !== undefined) walk((json as Record<string, unknown>)[k], `/${esc(k)}`);
  return out;
}

/** Lockfiles say what was installed, not what the package is: never read, so a lockfile-only change moves no fact. */
const LOCKFILES = new Set(["package-lock.json", "npm-shrinkwrap.json"]);

export function run(input: AdapterInput): AdapterOutput {
  const commit = input.config?.commit ?? "unknown";
  const base = { schema: SCHEMA, subject: { commit }, tool: { id: TOOL.id, version: TOOL.version } } as const;
  const facts: Fact[] = [];
  const diagnostics: Diagnostic[] = [];
  const files = [...input.files].sort((a, b) => compareCodePoints(a.path, b.path));
  const code = new Set(files.filter((f) => CODE.test(f.path)).map((f) => f.path));
  const workspace = workspacePackages(files);
  if (input.config?.commit === undefined) diagnostics.push({ code: "no-commit", severity: "warning", message: "the harness gave no commit, so these facts are never current" });
  for (const f of files) {
    const text = new TextDecoder().decode(f.bytes);
    if (f.path.endsWith(".json")) {
      if (LOCKFILES.has(posix.basename(f.path))) continue;
      try {
        for (const x of fieldsOf(JSON.parse(text), posix.basename(f.path) === "package.json" ? FIELDS : null)) facts.push({ ...base, kind: "field", at: f.path, file: f.path, path: x.path, value: x.value });
      } catch (err) {
        diagnostics.push({ code: "malformed-manifest", severity: "warning", message: (err as Error).message, span: f.path });
      }
      continue;
    }
    // YAML is read like JSON: every scalar by pointer, so a count of entries in a list can be claimed.
    if (/\.ya?ml$/.test(f.path)) {
      const y = parseYaml(text);
      if (y.problems.length > 0) diagnostics.push({ code: "malformed-manifest", severity: "warning", message: y.problems[0]!.message, span: `${f.path}:${y.problems[0]!.line}` });
      else for (const x of fieldsOf(y.value, null)) facts.push({ ...base, kind: "field", at: f.path, file: f.path, path: x.path, value: x.value });
      continue;
    }
    if (!code.has(f.path)) continue;
    facts.push({ ...base, kind: "module", at: f.path, name: f.path });
    // A Svelte component is read as the TypeScript of its script elements, at the lines they have in the component.
    const r = f.path.endsWith(".svelte") ? readFile(`${f.path}.ts`, svelteScript(text)) : readFile(f.path, text);
    for (const ref of r.refs) {
      const at = `${f.path}:${ref.line}`;
      // SvelteKit's generated types (./$types) are no file of the repository: not a dependency, and not unresolved.
      if (/^\.\/\$[\w-]+$/.test(ref.specifier)) continue;
      if (ref.specifier.startsWith(".")) {
        const to = resolveRelative(f.path, ref.specifier, code);
        if (to === undefined) facts.push({ ...base, kind: "skipped", at, from: f.path, reason: `unresolved ${ref.specifier}` });
        else if (to !== f.path) facts.push({ ...base, kind: "depends", at, from: f.path, to, via: "import", typeOnly: ref.typeOnly });
      } else {
        const local = workspace.size > 0 ? resolveWorkspace(ref.specifier, workspace, code) : undefined;
        facts.push({ ...base, kind: "depends", at, from: f.path, to: local !== undefined && local !== f.path ? local : packageOf(ref.specifier), via: "import", typeOnly: ref.typeOnly });
      }
    }
    for (const line of r.computed) facts.push({ ...base, kind: "skipped", at: `${f.path}:${line}`, from: f.path, reason: "computed specifier" });
    for (const d of r.declarations) facts.push({ ...base, kind: "declare", at: `${f.path}:${d.line}`, module: f.path, symbol: d.symbol, declares: d.declares, ...(d.base !== undefined ? { base: d.base } : {}), ...(d.value !== undefined ? { value: d.value } : {}) });
    for (const e of r.exports) facts.push({ ...base, kind: "export", at: f.path, module: f.path, symbol: e.symbol, ...(e.from !== undefined ? { from: e.from } : {}), typeOnly: e.typeOnly });
  }
  return { facts, diagnostics };
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
