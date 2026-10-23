// facts-java: code facts read from Java source files, and the fields of Maven's pom.xml (stage 32). Each file is
// parsed alone with the tree-sitter Java grammar; dependencies are resolved by fully qualified name against the files
// the source names, from each file's `package` declaration and the top-level types it declares, so the source roots
// of a multi-module build need not be known. Nothing is compiled, and no build tool runs.
//
// Facts: one module per file; one dependency per import, to the file that declares the imported type, or to every
// file of a package a wildcard names, or else to the Java package the import names (standard packages as written, so
// `java.util`); one declaration per type, with the class or interface it extends, a nested one under its dotted name
// (`Outer.Inner`, A-170), and per `static final` field of a type with a literal value; one export per public top-level
// type; and the fields of a pom.xml that say what the project is, its modules, properties and dependencies. A type
// referenced from its own package, or by a fully qualified name in code, needs no import and is no dependency here.
import { compareCodePoints } from "@csh/kernel";
import { parseXml, type Diagnostic, type Fact, type XmlElement } from "@csh/witness";
import { lineOf, parseWith, type Node } from "./parser.ts";
import type { FactContext, InputFile, LanguageReader } from "./run.ts";

export const JAVA_TOOL = { id: "facts-java", version: "0.1.0" } as const;

const TYPES: Record<string, "class" | "interface" | "enum" | "record" | "annotation"> = {
  class_declaration: "class",
  interface_declaration: "interface",
  enum_declaration: "enum",
  record_declaration: "record",
  annotation_type_declaration: "annotation",
};

export interface JavaImport {
  /** The name as written, without `static` or `.*`. */
  name: string;
  isStatic: boolean;
  wildcard: boolean;
  line: number;
}

export interface JavaDeclaration {
  symbol: string;
  declares: "class" | "interface" | "enum" | "record" | "annotation" | "const" | "method";
  line: number;
  base?: string;
  /** The interfaces a class, enum or record implements, and an interface's further supertypes (stage 59). */
  bases?: string[];
  value?: string;
  /** For a type: whether it is declared `public`. */
  public?: boolean;
  /** For an enum or a sealed type, its members by simple name, in source order (stage 49). */
  members?: string[];
  /**
   * For a top-level type, each `switch` in it that Java checks for completeness (stage 49): its case labels, and the
   * simple name of its selector's declared type when the selector is a parameter, local or field declared with one.
   */
  switches?: { labels: string[]; selector?: string }[];
  /** For a type declared in another type's body: it is declared, never exported. */
  nested?: boolean;
}

/** What one Java file says: its package, imports and type declarations, and the line of its first syntax error. */
export interface JavaFile {
  pkg: string;
  imports: JavaImport[];
  declarations: JavaDeclaration[];
  syntaxError?: number;
}

const words = (n: Node | null): Set<string> => new Set((n?.children ?? []).filter((c) => !c.isNamed).map((c) => c.type));
const modifiersOf = (n: Node): Set<string> => words(n.namedChildren.find((c) => c.type === "modifiers") ?? null);
const squash = (s: string) => s.replace(/\s+/g, "");

/** A type as written, without its type arguments or annotations: `a.b.Base<T>` is `a.b.Base`. */
export function stripType(text: string): string {
  let out = "";
  let depth = 0;
  for (const c of text.replace(/@[\w.]+(\([^)]*\))?/g, "")) {
    if (c === "<") depth++;
    else if (c === ">") depth--;
    else if (depth === 0) out += c;
  }
  return squash(out);
}

/** The text of a Java string or character literal's body, with its escapes decoded. */
export function unescapeJava(s: string): string {
  return s.replace(/\\u+([0-9a-fA-F]{4})|\\([0-3]?[0-7]{1,2})|\\(\r\n|[\s\S])/g, (_, u: string | undefined, oct: string | undefined, c: string | undefined) => {
    if (u !== undefined) return String.fromCharCode(Number.parseInt(u, 16));
    if (oct !== undefined) return String.fromCharCode(Number.parseInt(oct, 8));
    const map: Record<string, string> = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", s: " ", '"': '"', "'": "'", "\\": "\\", "\n": "", "\r\n": "" };
    return map[c!] ?? c!;
  });
}

/** A text block's value, by the rules of the language: incidental indentation and trailing spaces removed. */
function textBlock(raw: string): string {
  const inner = raw.slice(3, -3);
  const lines = inner.slice(inner.search(/\r\n|\r|\n/) + (inner.match(/\r\n|\r|\n/)?.[0].length ?? 0)).split(/\r\n|\r|\n/);
  const last = lines.length - 1;
  const indent = Math.min(...lines.filter((l, i) => l.trim() !== "" || i === last).map((l) => l.length - l.trimStart().length));
  return unescapeJava(lines.map((l) => (l.trim() === "" ? "" : l.slice(indent)).replace(/[ \t\f]+$/, "")).join("\n"));
}

/** A literal's value as text: a string or character unquoted, a number normalised, a boolean; else undefined. */
export function literalValue(n: Node | null): string | undefined {
  if (n === null) return undefined;
  switch (n.type) {
    case "string_literal":
      return n.text.startsWith('"""') ? textBlock(n.text) : unescapeJava(n.text.slice(1, -1));
    case "character_literal":
      return unescapeJava(n.text.slice(1, -1));
    case "true":
    case "false":
      return n.type;
    case "decimal_integer_literal":
    case "hex_integer_literal":
    case "binary_integer_literal":
    case "octal_integer_literal": {
      const t = n.text.replace(/_/g, "").replace(/[lL]$/, "");
      return BigInt(n.type === "octal_integer_literal" ? `0o${t.slice(1)}` : t).toString();
    }
    case "decimal_floating_point_literal": {
      const v = Number(n.text.replace(/_/g, "").replace(/[fFdD]$/, ""));
      return Number.isFinite(v) ? String(v) : undefined;
    }
    case "parenthesized_expression":
      return literalValue(n.namedChildren[0] ?? null);
    case "unary_expression": {
      const op = n.children.find((c) => !c.isNamed)?.type;
      const v = literalValue(n.childForFieldName("operand"));
      if (v === undefined || !/^[\d.]/.test(v) || (op !== "-" && op !== "+")) return undefined;
      if (op === "+") return v;
      return /^\d+$/.test(v) ? (-BigInt(v)).toString() : String(-Number(v));
    }
    default:
      return undefined;
  }
}

/** The `static final` fields of a type's body with a literal value; in an interface or annotation, every field. */
function constantsOf(type: Node, name: string): JavaDeclaration[] {
  const out: JavaDeclaration[] = [];
  for (const m of membersOf(type)) {
    const implicit = m.type === "constant_declaration";
    if (!implicit && m.type !== "field_declaration") continue;
    const mods = modifiersOf(m);
    if (!implicit && !(mods.has("static") && mods.has("final"))) continue;
    for (const d of m.childrenForFieldName("declarator")) {
      const value = literalValue(d.childForFieldName("value"));
      const id = d.childForFieldName("name");
      if (value !== undefined && id !== null) out.push({ symbol: `${name}.${id.text}`, declares: "const", line: lineOf(id), value });
    }
  }
  return out;
}

/**
 * The members of a closed type (stage 49): an enum's constants; a sealed type's `permits` list, else the types nested in
 * it that extend or implement it. Undefined for any other type.
 */
function closedMembersOf(n: Node, declares: string, name: string): string[] | undefined {
  const body = n.childForFieldName("body");
  if (declares === "enum") return (body?.namedChildren ?? []).filter((c) => c.type === "enum_constant").flatMap((c) => c.childForFieldName("name")?.text ?? []);
  if (!modifiersOf(n).has("sealed")) return undefined;
  const permits = n.namedChildren.find((c) => c.type === "permits")?.namedChildren.find((c) => c.type === "type_list");
  if (permits !== undefined) return permits.namedChildren.map((t) => stripType(t.text).split(".").pop()!);
  const names = (c: Node | null | undefined) => (c?.namedChildren ?? []).flatMap((t) => (t.type === "type_list" ? t.namedChildren : [t])).map((t) => stripType(t.text).split(".").pop()!);
  return (body?.namedChildren ?? []).filter((c) => Object.hasOwn(TYPES, c.type)).flatMap((c) => {
    const supers = [...names(c.childForFieldName("superclass")), ...names(c.childForFieldName("interfaces")), ...names(c.namedChildren.find((x) => x.type === "extends_interfaces"))];
    const id = c.childForFieldName("name");
    return id !== null && supers.includes(name) ? [id.text] : [];
  });
}

/** Where a `switch` is a statement: Java checks such a switch for completeness only when its labels are patterns. */
const STATEMENT = new Set(["block", "constructor_body", "switch_block_statement_group", "labeled_statement", "if_statement", "while_statement", "for_statement", "enhanced_for_statement", "do_statement", "expression_statement", "program"]);

/**
 * The labels of each `switch` in a type that Java checks for completeness (stage 49): one used as an expression, or one
 * with a pattern label. A switch with a `default` label is never complete over a type, since a new member falls into it.
 */
function switchesIn(n: Node): { labels: string[]; selector?: string }[] {
  const out: { labels: string[]; selector?: string }[] = [];
  for (const s of n.descendantsOfType("switch_expression")) {
    // Its own labels, not those of a switch nested in it: each sits in a rule or group of this switch's block.
    const body = s.childForFieldName("body");
    const labels = s.descendantsOfType("switch_label").filter((l) => body !== null && l.parent?.parent?.id === body.id);
    if (labels.some((l) => l.children.some((c) => c.type === "default"))) continue;
    const patterns = labels.some((l) => l.namedChildren.some((c) => c.type === "pattern" || c.type === "type_pattern" || c.type === "record_pattern"));
    if (!patterns && STATEMENT.has(s.parent?.type ?? "program")) continue;
    const names = labels.flatMap((l) =>
      l.namedChildren.flatMap((c) => {
        const t = c.type === "pattern" ? c.namedChildren[0] : c;
        if (t === undefined) return [];
        if (t.type === "type_pattern" || t.type === "record_pattern") {
          const ty = t.namedChildren.find((x) => x.type !== "identifier" && x.type !== "modifiers");
          return ty !== undefined ? [stripType(ty.text).split(".").pop()!] : [];
        }
        if (t.type === "identifier") return [t.text];
        if (t.type === "field_access") return [t.childForFieldName("field")?.text ?? t.text];
        return [];
      }),
    );
    if (names.length === 0) continue;
    const selector = selectorType(s);
    out.push({ labels: names, ...(selector !== undefined ? { selector } : {}) });
  }
  return out;
}

/**
 * The declared type of a switch's selector, by simple name, when the selector is a name declared with a type: a
 * parameter or local of an enclosing method, constructor or lambda, else a field of an enclosing type. `var`, and
 * any other expression, says nothing.
 */
function selectorType(s: Node): string | undefined {
  const cond = s.childForFieldName("condition");
  const e = cond?.type === "parenthesized_expression" ? cond.namedChildren[0] : cond;
  if (e === null || e === undefined || e.type !== "identifier") return undefined;
  const name = e.text;
  const typeOf = (t: Node | null): string | undefined => (t === null || t.text === "var" ? undefined : stripType(t.text).split(".").pop()!);
  for (let a = s.parent; a !== null; a = a.parent) {
    if (a.type === "method_declaration" || a.type === "constructor_declaration" || a.type === "lambda_expression") {
      for (const p of a.descendantsOfType(["formal_parameter", "local_variable_declaration"])) {
        if (p === null) continue;
        const id = p.type === "formal_parameter" ? p.childForFieldName("name") : p.childForFieldName("declarator")?.childForFieldName("name");
        if (id?.text === name) return typeOf(p.childForFieldName("type"));
      }
    }
    if (a.type === "class_body" || a.type === "enum_body" || a.type === "interface_body" || a.type === "record_declaration") {
      for (const fd of a.namedChildren) {
        if (fd === null || fd.type !== "field_declaration") continue;
        if (fd.childForFieldName("declarator")?.childForFieldName("name")?.text === name) return typeOf(fd.childForFieldName("type"));
      }
    }
  }
  return undefined;
}

/** Every import and top-level declaration of one Java file, as plain data: the tree is freed once read. */
export function readJava(text: string): Promise<JavaFile> {
  return parseWith("java", text, readTree);
}

function readTree(root: Node): JavaFile {
  let pkg = "";
  const imports: JavaImport[] = [];
  const declarations: JavaDeclaration[] = [];
  for (const n of root.namedChildren) {
    if (n.type === "package_declaration") {
      const id = n.namedChildren.find((c) => c.type === "scoped_identifier" || c.type === "identifier");
      if (id !== undefined) pkg = squash(id.text);
    } else if (n.type === "import_declaration") {
      const id = n.namedChildren.find((c) => c.type === "scoped_identifier" || c.type === "identifier");
      if (id !== undefined) imports.push({ name: squash(id.text), isStatic: words(n).has("static"), wildcard: n.namedChildren.some((c) => c.type === "asterisk"), line: lineOf(n) });
    } else if (Object.hasOwn(TYPES, n.type)) declareType(n, "", declarations);
  }
  const error = root.hasError ? root.descendantsOfType("ERROR")[0] ?? firstMissing(root) : undefined;
  return { pkg, imports, declarations, ...(error !== undefined ? { syntaxError: lineOf(error) } : {}) };
}

/**
 * A type, its constants and, under its dotted name, every type declared in its body at any depth (A-170). A type
 * inside a method, constructor, initializer or anonymous class is not a member of the body, so it is not declared.
 */
function declareType(n: Node, outer: string, out: JavaDeclaration[]): void {
  const id = n.childForFieldName("name");
  if (id === null) return;
  const declares = TYPES[n.type]!;
  const symbol = outer === "" ? id.text : `${outer}.${id.text}`;
  let base: Node | null | undefined;
  if (declares === "class") base = n.childForFieldName("superclass")?.namedChildren[0];
  else if (declares === "interface") base = n.namedChildren.find((c) => c.type === "extends_interfaces")?.namedChildren[0]?.namedChildren[0];
  const stripped = base !== null && base !== undefined ? stripType(base.text) : "";
  // The interfaces it implements, or, for an interface, those it extends after the first (stage 59).
  const listed = (declares === "interface" ? n.namedChildren.find((c) => c.type === "extends_interfaces") : n.childForFieldName("interfaces"))?.namedChildren.find((c) => c.type === "type_list")?.namedChildren ?? [];
  const bases = listed.slice(declares === "interface" ? 1 : 0).flatMap((t) => (t === null ? [] : [stripType(t.text)])).filter((t) => t !== "");
  const members = closedMembersOf(n, declares, id.text);
  // A switch belongs to the top-level type that holds it, nested types' included (stage 49).
  const switches = outer === "" ? switchesIn(n) : [];
  out.push({ symbol, declares, line: lineOf(id), ...(stripped !== "" ? { base: stripped } : {}), ...(bases.length > 0 ? { bases } : {}), public: modifiersOf(n).has("public"), ...(outer !== "" ? { nested: true } : {}), ...(members !== undefined ? { members } : {}), ...(switches.length > 0 ? { switches } : {}) });
  out.push(...constantsOf(n, symbol));
  // Its methods, as `Type.name` (stage 67), each name once however it is overloaded.
  const methods = new Set<string>();
  for (const m of membersOf(n)) {
    const name = m.type === "method_declaration" ? m.childForFieldName("name") : null;
    if (name !== null && !methods.has(name.text)) {
      methods.add(name.text);
      out.push({ symbol: `${symbol}.${name.text}`, declares: "method", line: lineOf(name), nested: true });
    }
  }
  for (const m of membersOf(n)) if (Object.hasOwn(TYPES, m.type)) declareType(m, symbol, out);
}

/** The members of a type's body; an enum's are those after its constants. */
function membersOf(type: Node): Node[] {
  const body = type.childForFieldName("body");
  if (body === null) return [];
  return body.type === "enum_body" ? body.namedChildren.filter((c) => c.type === "enum_body_declarations").flatMap((c) => c.namedChildren) : body.namedChildren;
}

function firstMissing(n: Node): Node | undefined {
  if (n.isMissing) return n;
  for (const c of n.children) {
    const m = c.hasError || c.isMissing ? firstMissing(c) : undefined;
    if (m !== undefined) return m;
  }
  return undefined;
}

/** The package an unread type's name falls in: the segments before the first capitalised one. */
export function packageOfName(name: string, endsInType: boolean): string {
  const segs = name.split(".");
  const at = segs.findIndex((s) => /^[A-Z]/.test(s));
  if (at > 0) return segs.slice(0, at).join(".");
  if (at === 0 || !endsInType || segs.length === 1) return name;
  return segs.slice(0, -1).join(".");
}

/** The fields of a pom.xml that say what the project is, its modules, properties and dependencies. */
export function pomFields(f: InputFile, ctx: FactContext): { facts: Fact[]; diagnostics: Diagnostic[] } {
  const x = parseXml(new TextDecoder().decode(f.bytes));
  if (x.root === undefined) {
    const p = x.problems[0]!;
    return { facts: [], diagnostics: [{ code: "malformed-manifest", severity: "warning", message: p.message, span: `${f.path}:${p.line}` }] };
  }
  const facts: Fact[] = [];
  const esc = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");
  const field = (path: string, value: string) => facts.push({ ...ctx.base(JAVA_TOOL), kind: "field", at: f.path, file: f.path, path, value });
  const child = (el: XmlElement, name: string) => el.children.find((c) => c.name === name);
  const scalars = (el: XmlElement | undefined, prefix: string, names: readonly string[]) => {
    for (const name of names) {
      const c = el !== undefined ? child(el, name) : undefined;
      if (c !== undefined) field(`${prefix}/${name}`, c.text.trim());
    }
  };
  const project = x.root;
  scalars(project, "", ["groupId", "artifactId", "version", "packaging"]);
  scalars(child(project, "parent"), "/parent", ["groupId", "artifactId", "version"]);
  (child(project, "modules")?.children ?? []).filter((c) => c.name === "module").forEach((m, i) => field(`/modules/${i}`, m.text.trim()));
  for (const p of child(project, "properties")?.children ?? []) field(`/properties/${esc(p.name)}`, p.text.trim());
  (child(project, "dependencies")?.children ?? []).filter((c) => c.name === "dependency").forEach((d, i) => scalars(d, `/dependencies/${i}`, ["groupId", "artifactId", "version", "scope"]));
  return { facts, diagnostics: [] };
}

/** Reads every Java file and pom.xml it is handed; dependencies resolve against those files alone. */
export async function readJavaFiles(input: readonly InputFile[], ctx: FactContext): Promise<{ facts: Fact[]; diagnostics: Diagnostic[] }> {
  const base = ctx.base(JAVA_TOOL);
  const facts: Fact[] = [];
  const diagnostics: Diagnostic[] = [];
  const files = [...input].sort((a, b) => compareCodePoints(a.path, b.path));
  const read = new Map<string, JavaFile>();
  for (const f of files) if (f.path.endsWith(".java")) read.set(f.path, await readJava(new TextDecoder().decode(f.bytes)));
  // Which files declare each fully qualified type, nested ones included, and which files each package holds.
  const types = new Map<string, string[]>();
  const packages = new Map<string, string[]>();
  for (const [path, j] of read) {
    packages.set(j.pkg, [...(packages.get(j.pkg) ?? []), path]);
    for (const d of j.declarations) {
      if (d.declares === "const" || d.declares === "method") continue;
      const fqn = j.pkg === "" ? d.symbol : `${j.pkg}.${d.symbol}`;
      types.set(fqn, [...(types.get(fqn) ?? []), path]);
    }
  }
  // The files declaring the longest prefix of a name that is a type read, with that prefix.
  const typeOf = (name: string): { fqn: string; files: string[] } | undefined => {
    const segs = name.split(".");
    for (let k = segs.length; k > 0; k--) {
      const fqn = segs.slice(0, k).join(".");
      const found = types.get(fqn);
      if (found !== undefined) return { fqn, files: found };
    }
    return undefined;
  };
  // The closed types read, by simple name; a switch is complete over the one whose members its labels name exactly
  // (stage 49). Its selector's declared type, when read, decides which; without one, two closed types with the same
  // members leave the switch unattributed rather than credit a type it may not switch over.
  const closed = new Map<string, Set<string>[]>();
  for (const j of read.values()) for (const d of j.declarations) if (d.members !== undefined) closed.set(d.symbol, [...(closed.get(d.symbol) ?? []), new Set(d.members)]);
  const totalOf = (d: JavaDeclaration): string[] => {
    const over = new Set<string>();
    for (const sw of d.switches ?? []) {
      const named = new Set(sw.labels);
      const fits = [...closed].filter(([name, sets]) => (sw.selector === undefined || sw.selector === name) && sets.some((m) => m.size === named.size && [...m].every((x) => named.has(x)))).map(([name]) => name);
      if (fits.length === 1) over.add(fits[0]!);
    }
    return [...over].sort(compareCodePoints);
  };
  for (const f of files) {
    const j = read.get(f.path);
    if (j === undefined) {
      const out = pomFields(f, ctx);
      facts.push(...out.facts);
      diagnostics.push(...out.diagnostics);
      continue;
    }
    facts.push({ ...base, kind: "module", at: f.path, name: f.path, language: "java" });
    if (j.syntaxError !== undefined) diagnostics.push({ code: "syntax-error", severity: "warning", message: "the Java parser recovered from a syntax error; facts after it may be missing", span: `${f.path}:${j.syntaxError}` });
    for (const imp of j.imports) {
      const at = `${f.path}:${imp.line}`;
      // A package that was not read is a dotted namespace: its classes and subpackages are named under it (A-171).
      const depend = (to: string, external = false) => {
        if (to !== f.path) facts.push({ ...base, kind: "depends", at, from: f.path, to, via: "import", typeOnly: false, ...(external ? { namespace: "dotted" as const } : {}) });
      };
      // `import a.b.*` names a package, or the member types of a class; a static import names a class's members.
      const onPackage = imp.wildcard && !imp.isStatic ? packages.get(imp.name) : undefined;
      if (onPackage !== undefined) {
        for (const to of onPackage) depend(to);
        continue;
      }
      const cls = imp.isStatic && !imp.wildcard && imp.name.includes(".") ? imp.name.slice(0, imp.name.lastIndexOf(".")) : imp.name;
      const found = typeOf(cls);
      if (found === undefined) depend(packageOfName(cls, !(imp.wildcard && !imp.isStatic)), true);
      else if (found.files.length > 1) facts.push({ ...base, kind: "skipped", at, from: f.path, reason: `ambiguous ${found.fqn}: declared in ${found.files.join(", ")}` });
      else depend(found.files[0]!);
    }
    for (const d of j.declarations) {
      const total = totalOf(d);
      facts.push({ ...base, kind: "declare", at: `${f.path}:${d.line}`, module: f.path, symbol: d.symbol, declares: d.declares, ...(d.base !== undefined ? { base: d.base } : {}), ...(d.bases !== undefined ? { bases: d.bases } : {}), ...(d.value !== undefined ? { value: d.value } : {}), ...(d.members !== undefined ? { members: d.members } : {}), ...(total.length > 0 ? { total } : {}) });
    }
    for (const d of j.declarations) if (d.public === true && d.nested !== true) facts.push({ ...base, kind: "export", at: `${f.path}:${d.line}`, module: f.path, symbol: d.symbol, typeOnly: false });
  }
  return { facts, diagnostics };
}

export const javaReader: LanguageReader = {
  language: "java",
  manifest: (path) => path === "pom.xml" || path.endsWith("/pom.xml"),
  read: readJavaFiles,
};
