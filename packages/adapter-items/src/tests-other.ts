// The test-file inventory for Python, Java, Go and Rust (Polyglot code, stage 35). A test file in one of these
// languages is one item, as a TypeScript one is, with the number of tests it declares, found by the convention its
// runner collects by: pytest's `test*` functions, JUnit's annotated methods, Go's `TestXxx`, `ExampleXxx` and
// `FuzzXxx` functions, and Rust's `#[test]` functions. What cites is what the runner reports or the author attaches to
// the test: its name, its docstring or doc comment, its display name, its tags and markers. The file is read as text
// and never run or parsed by a grammar: a small lexer per language blanks comments and strings, so a test written in a
// fixture string or a comment is not a test, and keeps both aside, so a string argument or a doc comment can still be
// read where it cites. A parametrised or table-driven test counts once, as the source declares it once.
import { compareCodePoints } from "@csh/kernel";

export type Language = "python" | "java" | "go" | "rust";

/** The language whose test conventions a file follows, by extension; undefined for TypeScript, JavaScript and the rest. */
export function languageOf(path: string): Language | undefined {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".java")) return "java";
  if (path.endsWith(".go")) return "go";
  if (path.endsWith(".rs")) return "rust";
  return undefined;
}

/** A file read by the lexer: its code with comments and string contents blanked, and both kept by offset. */
export interface Lexed {
  code: string;
  /** The content of each string literal, by the offset of its opening quote. */
  strings: Map<number, string>;
  /** The text of each comment, delimiters included, by the offset where it starts. */
  comments: Map<number, string>;
}

/**
 * The code of a file in one of the four languages with every comment and every string's content blanked to spaces
 * (line breaks kept, so offsets and lines still match the text). Python: `#` comments, and single, triple-quoted and
 * prefixed strings. Java: `//` and block comments, strings, character literals and `"""` text blocks. Go: the same,
 * with backticked raw strings that know no escape. Rust: nested block comments, strings that span lines, raw strings
 * (`r#"..."#`), and character literals told from lifetimes.
 */
export function lexOther(text: string, lang: Language): Lexed {
  const out = text.split("");
  const strings = new Map<number, string>();
  const comments = new Map<number, string>();
  const blank = (a: number, b: number) => {
    for (let k = a; k < b && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };
  const comment = (a: number, b: number) => {
    comments.set(a, text.slice(a, b));
    blank(a, b);
    return b;
  };
  // A string from its opening quote at `i`, its content from `a` to `b`, ending at `end`.
  const string = (i: number, a: number, b: number, end: number) => {
    strings.set(i, text.slice(a, b));
    blank(a, b);
    return end;
  };
  // An escaped string closing on `close`; a newline ends it unless it may span lines.
  const escaped = (i: number, open: number, close: string, multiline: boolean) => {
    let j = i + open;
    while (j < text.length && !text.startsWith(close, j) && (multiline || text[j] !== "\n")) j += text[j] === "\\" ? 2 : 1;
    const b = Math.min(j, text.length);
    return string(i, i + open, b, text.startsWith(close, b) ? b + close.length : b);
  };
  const lineEnd = (i: number) => {
    const e = text.indexOf("\n", i);
    return e < 0 ? text.length : e;
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const next = text[i + 1];
    const before = i > 0 ? text[i - 1]! : "";
    if (lang === "python") {
      if (c === "#") i = comment(i, lineEnd(i));
      else if (c === "'" || c === '"') i = text.startsWith(c.repeat(3), i) ? escaped(i, 3, c.repeat(3), true) : escaped(i, 1, c, false);
      else i++;
      continue;
    }
    if (c === "/" && next === "/") i = comment(i, lineEnd(i));
    else if (c === "/" && next === "*") {
      // Rust's block comments nest; Java's and Go's do not.
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text.startsWith("*/", j)) {
          depth--;
          j += 2;
        } else if (lang === "rust" && text.startsWith("/*", j)) {
          depth++;
          j += 2;
        } else j++;
      }
      i = comment(i, j);
    } else if (c === '"') {
      if (lang === "java" && text.startsWith('"""', i)) i = escaped(i, 3, '"""', true);
      else i = escaped(i, 1, '"', lang === "rust");
    } else if (c === "`" && lang === "go") {
      const e = text.indexOf("`", i + 1);
      const b = e < 0 ? text.length : e;
      i = string(i, i + 1, b, e < 0 ? b : b + 1);
    } else if (c === "r" && lang === "rust" && !/[\w]/.test(before === "b" ? (text[i - 2] ?? "") : before) && /^r#*"/.test(text.slice(i, i + 258))) {
      const hashes = /^r(#*)"/.exec(text.slice(i, i + 258))![1]!;
      const close = `"${hashes}`;
      const q = i + 1 + hashes.length;
      const e = text.indexOf(close, q + 1);
      const b = e < 0 ? text.length : e;
      i = string(q, q + 1, b, e < 0 ? b : b + close.length);
    } else if (c === "'") {
      // A character literal: an escape, or one character, then a quote. In Rust, anything else is a lifetime or a label.
      const m = /^'(\\(?:u\{[0-9a-fA-F]{1,6}\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)|[^\\'\n][\uDC00-\uDFFF]?)'/.exec(text.slice(i, i + 16));
      if (m !== null) i = string(i, i + 1, i + m[0].length - 1, i + m[0].length);
      else if (lang === "rust") i++;
      else i = escaped(i, 1, "'", false);
    } else i++;
  }
  return { code: out.join(""), strings, comments };
}

/** Where a test file's text cites from: the text, its offset, and whether it is a name, whose underscores may stand for hyphens. */
export interface CiteSource {
  at: number;
  text: string;
  name: boolean;
}

/** What a test file in one of the four languages declares: its tests, those marked skipped, and the texts that cite. */
export interface Inventory {
  tests: number;
  skipped: number;
  sources: CiteSource[];
  strings: Map<number, string>;
}

/** The test inventory of a file in one of the four languages. A Go file whose name does not end in `_test.go` declares none. */
export function inventory(text: string, lang: Language, path = ""): Inventory {
  const lexed = lexOther(text, lang);
  const found =
    lang === "python" ? python(lexed) : lang === "java" ? java(lexed) : lang === "go" ? (path.endsWith("_test.go") ? go(lexed) : { tests: 0, skipped: 0, sources: [] }) : rust(text, lexed);
  // Sources in the order they stand in the file, so that edges come out in that order whatever the reader found first.
  const sources = [...found.sources].sort((a, b) => a.at - b.at || compareCodePoints(a.text, b.text));
  return { ...found, sources, strings: lexed.strings };
}

type Found = Omit<Inventory, "strings">;

/** The offset just past the bracket that closes the one opened before `at`, counting only brackets in code. */
function pastClose(code: string, at: number, open = "(", close = ")"): number {
  let depth = 1;
  while (at < code.length && depth > 0) {
    if (code[at] === open) depth++;
    else if (code[at] === close) depth--;
    at++;
  }
  return at;
}

const skipSpace = (code: string, at: number) => {
  while (at < code.length && /\s/.test(code[at]!)) at++;
  return at;
};

/** Every string literal that opens between `a` and `b`, as cite sources. */
function stringsIn(strings: Map<number, string>, a: number, b: number): CiteSource[] {
  return [...strings].filter(([at]) => at >= a && at < b).map(([at, text]) => ({ at, text, name: false }));
}

/** A name as a cite source, whole and without the runner's prefix (`test_REQ_12` is read as `REQ_12` too). */
function nameSources(at: number, name: string, prefix: RegExp): CiteSource[] {
  const out: CiteSource[] = [{ at, text: name, name: true }];
  const m = prefix.exec(name);
  if (m !== null && m[0].length < name.length) out.push({ at: at + m[0].length, text: name.slice(m[0].length), name: true });
  return out;
}

// --- Python -----------------------------------------------------------------------------------------------------

interface Block {
  indent: number;
  kind: "class" | "def";
  name: string;
  testClass: boolean;
  skip: boolean;
  hasTests: boolean;
  cites: CiteSource[];
}

/**
 * pytest's conventions: a function whose name starts `test`, at module level or in a class whose name starts `Test`
 * (or one that names `TestCase` among its bases), nested only in such classes. A function inside a function is not
 * collected. Cites: the name, the first line of the docstring with words, the string arguments of a
 * `@pytest.mark.<marker>(...)` decorator, and of a `parametrize` only its `ids=[...]` and each `pytest.param(id=...)`.
 * The same on a test class, when it holds a test. `@pytest.mark.skip` and `@unittest.skip` count a test as skipped;
 * `skipif` and `xfail` decide at run time and do not.
 */
function python({ code, strings }: Lexed): Found {
  const sources: CiteSource[] = [];
  let tests = 0;
  let skipped = 0;
  const stack: Block[] = [];
  let decorators: [number, number][] = [];
  const close = (b: Block) => {
    if (b.kind === "class" && b.hasTests) sources.push(...b.cites);
  };
  for (const { start, end, indent } of logicalLines(code)) {
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) close(stack.pop()!);
    const line = code.slice(start, end);
    if (line.startsWith("@")) {
      decorators.push([start, end]);
      continue;
    }
    const def = /^(?:async\s+)?def\s+(\w+)/.exec(line);
    const cls = /^class\s+(\w+)/.exec(line);
    const marks = decorators.flatMap(([a, b]) => pytestMarks(code, strings, a, b));
    const skip = decorators.some(([a, b]) => /(?<![\w.])(?:(?:pytest\.)?mark|unittest)\.skip\b/.test(code.slice(a, b)));
    decorators = [];
    if (cls !== null) {
      const at = start + cls[0].length - cls[1]!.length;
      const testClass = (cls[1]!.startsWith("Test") || /\bTestCase\b/.test(line)) && stack.every((b) => b.kind === "class" && b.testClass);
      stack.push({ indent, kind: "class", name: cls[1]!, testClass, skip, hasTests: false, cites: [...nameSources(at, cls[1]!, /^Test_?/), ...marks] });
    } else if (def !== null) {
      const name = def[1]!;
      const at = start + def[0].length - name.length;
      if (name.startsWith("test") && stack.every((b) => b.kind === "class" && b.testClass)) {
        tests++;
        if (skip || stack.some((b) => b.skip)) skipped++;
        for (const b of stack) b.hasTests = true;
        sources.push(...nameSources(at, name, /^test_?/), ...marks);
        const doc = docstring(code, strings, at + name.length);
        if (doc !== undefined) sources.push(doc);
      }
      stack.push({ indent, kind: "def", name, testClass: false, skip: false, hasTests: false, cites: [] });
    }
  }
  while (stack.length > 0) close(stack.pop()!);
  return { tests, skipped, sources };
}

/** Each logical line of Python code: where its text starts and ends, and its indentation. Bracketed continuations join. */
function logicalLines(code: string): { start: number; end: number; indent: number }[] {
  const out: { start: number; end: number; indent: number }[] = [];
  let i = 0;
  while (i < code.length) {
    let s = i;
    while (s < code.length && (code[s] === " " || code[s] === "\t")) s++;
    const indent = s - i;
    let depth = 0;
    let j = s;
    while (j < code.length) {
      const c = code[j]!;
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
      else if (c === "\n" && depth === 0 && code[j - 1] !== "\\") break;
      j++;
    }
    if (code.slice(s, j).trim() !== "") out.push({ start: s, end: j, indent });
    i = j + 1;
  }
  return out;
}

/** The cite sources of the pytest markers among a decorator's text. */
function pytestMarks(code: string, strings: Map<number, string>, a: number, b: number): CiteSource[] {
  const out: CiteSource[] = [];
  const re = /(?<![\w.])(?:pytest\.)?mark\.(\w+)\s*\(/g;
  re.lastIndex = a;
  for (let m = re.exec(code); m !== null && m.index < b; m = re.exec(code)) {
    const open = m.index + m[0].length;
    const shut = pastClose(code, open) - 1;
    if (m[1] !== "parametrize") {
      out.push(...stringsIn(strings, open, shut));
      continue;
    }
    // A parametrize's values are data; only the ids its runner reports cite.
    const args = code.slice(open, shut);
    for (const k of args.matchAll(/\bids\s*=\s*([[(])/g)) {
      const from = open + k.index + k[0].length;
      out.push(...stringsIn(strings, from, pastClose(code, from, k[1], k[1] === "[" ? "]" : ")")));
    }
    for (const k of args.matchAll(/\bid\s*=\s*/g)) {
      const at = open + k.index + k[0].length;
      const s = strings.get(at + (/[rRuU]/.test(code[at]!) ? 1 : 0));
      if (s !== undefined) out.push({ at, text: s, name: false });
    }
  }
  return out;
}

/** The first line with words of a function's docstring, from the end of its name. */
function docstring(code: string, strings: Map<number, string>, from: number): CiteSource | undefined {
  const open = code.indexOf("(", from);
  if (open < 0) return undefined;
  let at = pastClose(code, open + 1);
  // The colon that ends the header, past any return annotation.
  let depth = 0;
  while (at < code.length && !(code[at] === ":" && depth === 0)) {
    if ("([{".includes(code[at]!)) depth++;
    else if (")]}".includes(code[at]!)) depth--;
    at++;
  }
  at = skipSpace(code, at + 1);
  if (/[rRuU]/.test(code[at] ?? "")) at++;
  const doc = strings.get(at);
  if (doc === undefined) return undefined;
  const quote = code.startsWith(code[at]!.repeat(3), at) ? 3 : 1;
  let offset = at + quote;
  for (const line of doc.split("\n")) {
    if (line.trim() !== "") return { at: offset, text: line, name: false };
    offset += line.length + 1;
  }
  return undefined;
}

// --- Java -------------------------------------------------------------------------------------------------------

const JAVA_TESTS = new Set(["Test", "ParameterizedTest", "RepeatedTest", "TestFactory"]);
const JAVA_MODIFIERS = new Set(["public", "protected", "private", "static", "final", "abstract", "synchronized", "default", "strictfp", "native"]);

interface Annotation {
  name: string;
  open: number;
  shut: number;
}

/**
 * JUnit 4's and 5's conventions: a method annotated `@Test`, `@ParameterizedTest`, `@RepeatedTest` or `@TestFactory`,
 * by its simple name or a qualified one (`@org.junit.Test`). Cites: the method's name, and the strings of a
 * `@DisplayName`, `@Tag` or `@Tags` on the method or on a class that encloses it. `@Disabled` or `@Ignore` on the method
 * or an enclosing class counts it as skipped.
 */
function java({ code, strings }: Lexed): Found {
  const sources: CiteSource[] = [];
  const classes: { body: [number, number]; annotations: Annotation[]; used: boolean }[] = [];
  const methods: { at: number; name: string; annotations: Annotation[] }[] = [];
  let cursor = code.indexOf("@");
  while (cursor >= 0) {
    // A run of annotations and modifiers, then what they annotate.
    const annotations: Annotation[] = [];
    let at = cursor;
    for (;;) {
      at = skipSpace(code, at);
      const a = /^@\s*([\w$]+(?:\s*\.\s*[\w$]+)*)/.exec(code.slice(at, at + 300));
      const w = /^[a-z]+\b/.exec(code.slice(at, at + 20));
      if (a !== null && !/^interface$/.test(a[1]!)) {
        at = skipSpace(code, at + a[0].length);
        let open = at;
        let shut = at;
        if (code[at] === "(") {
          open = at + 1;
          at = pastClose(code, at + 1);
          shut = at - 1;
        }
        annotations.push({ name: a[1]!.split(".").pop()!.trim(), open, shut });
      } else if (w !== null && JAVA_MODIFIERS.has(w[0])) at += w[0].length;
      else break;
    }
    const target = javaTarget(code, at);
    if (target?.kind === "class") classes.push({ body: target.body, annotations, used: false });
    else if (target?.kind === "method" && annotations.some((a) => JAVA_TESTS.has(a.name))) methods.push({ at: target.at, name: target.name, annotations });
    cursor = code.indexOf("@", Math.max(at, cursor + 1));
  }
  const cites = (annotations: Annotation[]) =>
    annotations.filter((a) => a.name === "DisplayName" || a.name === "Tag" || a.name === "Tags").flatMap((a) => stringsIn(strings, a.open, a.shut));
  const disabled = (annotations: Annotation[]) => annotations.some((a) => a.name === "Disabled" || a.name === "Ignore");
  let skipped = 0;
  for (const m of methods) {
    const enclosing = classes.filter((c) => c.body[0] < m.at && m.at < c.body[1]);
    for (const c of enclosing) c.used = true;
    if (disabled(m.annotations) || enclosing.some((c) => disabled(c.annotations))) skipped++;
    sources.push(...nameSources(m.at, m.name, /^test_?/), ...cites(m.annotations));
  }
  for (const c of classes) if (c.used) sources.push(...cites(c.annotations));
  return { tests: methods.length, skipped, sources };
}

/** What a run of annotations ending at `at` annotates: a class (with its body) or a method (with its name), or neither. */
function javaTarget(code: string, at: number): { kind: "class"; body: [number, number] } | { kind: "method"; at: number; name: string } | undefined {
  while (at < code.length) {
    at = skipSpace(code, at);
    const w = /^[A-Za-z_$][\w$]*/.exec(code.slice(at, at + 200));
    if (w !== null) {
      if (/^(class|interface|enum|record)$/.test(w[0])) {
        const open = code.indexOf("{", at);
        return open < 0 ? undefined : { kind: "class", body: [open, pastClose(code, open + 1, "{", "}")] };
      }
      const after = skipSpace(code, at + w[0].length);
      if (code[after] === "(") return { kind: "method", at, name: w[0] };
      at += w[0].length;
    } else if ("{};=(".includes(code[at] ?? ";")) return undefined;
    else at++;
  }
  return undefined;
}

// --- Go ---------------------------------------------------------------------------------------------------------

/**
 * `go test`'s conventions, in a `_test.go` file: `func TestXxx(t *testing.T)`, `func FuzzXxx(f *testing.F)` and
 * `func ExampleXxx()` with an `// Output:` comment (an example without one is compiled, not run), where Xxx does not
 * start with a lower-case letter. `TestMain` and benchmarks are not tests. Cites: the function's name, and the literal
 * first argument of each `t.Run` in its body, which names a subtest the runner reports; subtests do not add to the count.
 */
function go({ code, strings, comments }: Lexed): Found {
  const sources: CiteSource[] = [];
  let tests = 0;
  for (const m of code.matchAll(/(?<![\w.])func\s+((Test|Fuzz|Example)(\w*))\s*\(/g)) {
    const name = m[1]!;
    const kind = m[2]!;
    const rest = m[3]!;
    if (/^[a-z]/.test(rest)) continue;
    const open = m.index + m[0].length;
    const shut = pastClose(code, open);
    const params = code.slice(open, shut - 1);
    const brace = code.indexOf("{", shut);
    if (brace < 0) continue;
    const body: [number, number] = [brace, pastClose(code, brace + 1, "{", "}")];
    if (kind === "Test" && !/^\s*(?:\w+\s+)?\*\s*testing\s*\.\s*T\s*$/.test(params)) continue;
    if (kind === "Fuzz" && !/^\s*(?:\w+\s+)?\*\s*testing\s*\.\s*F\s*$/.test(params)) continue;
    if (kind === "Example" && (params.trim() !== "" || ![...comments].some(([at, c]) => at > body[0] && at < body[1] && /^\/\/\s*(?:Unordered output|Output):/i.test(c)))) continue;
    tests++;
    sources.push(...nameSources(m.index + m[0].indexOf(name), name, /^(?:Test|Fuzz|Example)_?/));
    // The names a *testing.T goes by in this function, its own and each subtest's.
    const ts = new Set([...code.slice(open, body[1]).matchAll(/(\w+)\s+\*\s*testing\s*\.\s*T\b/g)].map((t) => t[1]!));
    for (const r of code.slice(body[0], body[1]).matchAll(/(?<![\w.])(\w+)\s*\.\s*Run\s*\(/g)) {
      if (!ts.has(r[1]!)) continue;
      const at = skipSpace(code, body[0] + r.index + r[0].length);
      const s = strings.get(at);
      if (s !== undefined) sources.push({ at, text: s, name: false });
    }
  }
  return { tests, skipped: 0, sources };
}

// --- Rust -------------------------------------------------------------------------------------------------------

const RUST_MODIFIERS = new Set(["pub", "async", "unsafe", "const", "extern", "default"]);

/**
 * libtest's conventions: a function with a `#[test]` attribute, or `#[rstest]`, or any attribute whose path ends in
 * `::test` (`#[tokio::test]`, `#[async_std::test]`). An rstest with cases counts once. `#[ignore]` counts it as
 * skipped. Cites: the function's name, and each `///` or `//!` doc comment line immediately above it or among its
 * attributes, read from the comments the lexer kept.
 */
function rust(text: string, { code, comments }: Lexed): Found {
  const sources: CiteSource[] = [];
  let tests = 0;
  let skipped = 0;
  for (const m of code.matchAll(/(?<![\w#])fn\s+(\w+)/g)) {
    let start = m.index;
    const attributes: string[] = [];
    // Back over modifiers (`pub(crate)`, `extern "C"`) and attributes to where the item starts.
    for (;;) {
      let at = start;
      while (at > 0 && /\s/.test(code[at - 1]!)) at--;
      const word = /([a-z]+)$/.exec(code.slice(Math.max(0, at - 12), at));
      if (word !== null && RUST_MODIFIERS.has(word[1]!) && !/\w/.test(code[at - word[1]!.length - 1] ?? "")) {
        start = at - word[1]!.length;
      } else if (code[at - 1] === ")" || code[at - 1] === '"') {
        const open = code[at - 1] === ")" ? backTo(code, at - 1, "(", ")") : code.lastIndexOf('"', at - 2);
        if (open < 0 || !/(pub|extern)\s*$/.test(code.slice(Math.max(0, open - 10), open))) break;
        start = open;
      } else if (code[at - 1] === "]") {
        const open = backTo(code, at - 1, "[", "]");
        if (open < 1 || code[open - 1] !== "#") break;
        attributes.push(code.slice(open + 1, at - 1).trim());
        start = open - 1;
      } else break;
    }
    const paths = attributes.map((a) => /^[\w:]+/.exec(a)?.[0] ?? "");
    if (!paths.some((p) => p === "test" || p === "rstest" || /::test$/.test(p))) continue;
    tests++;
    if (paths.includes("ignore")) skipped++;
    sources.push(...nameSources(m.index + m[0].length - m[1]!.length, m[1]!, /^test_?/));
    // Doc comment lines: those among the attributes, and the run of them immediately above the item.
    const starts = lineStarts(text);
    const first = lineIndex(starts, start);
    const last = lineIndex(starts, m.index);
    const doc = (k: number) => {
      const at = skipSpace(text, starts[k]!);
      const c = comments.get(at);
      return c !== undefined && /^\/\/[/!](?!\/)/.test(c) && lineIndex(starts, at) === k ? { at: at + 3, text: c.slice(3), name: false } : undefined;
    };
    for (let k = first - 1; k >= 0; k--) {
      const d = doc(k);
      if (d === undefined) break;
      sources.push(d);
    }
    for (let k = first; k < last; k++) {
      const d = doc(k);
      if (d !== undefined) sources.push(d);
    }
  }
  return { tests, skipped, sources };
}

/** The offset of the bracket that opens the one that closes at `at`, counting only brackets in code; -1 if none. */
function backTo(code: string, at: number, open: string, close: string): number {
  let depth = 1;
  for (let k = at - 1; k >= 0; k--) {
    if (code[k] === close) depth++;
    else if (code[k] === open && --depth === 0) return k;
  }
  return -1;
}

/** The offset at which each line of a text starts. */
export function lineStarts(text: string): number[] {
  const out = [0];
  for (let k = text.indexOf("\n"); k >= 0; k = text.indexOf("\n", k + 1)) out.push(k + 1);
  return out;
}

/** The zero-based line an offset falls on. */
export function lineIndex(starts: number[], at: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Whether an identifier pattern can never match an underscore, so that in a name (`test_REQ_12_rejects`) an underscore
 * can only be a separator and is read as a hyphen (`REQ-12`) unambiguously. Decided from the pattern's text, and
 * cautiously: `_`, `\w`, `\W`, `\S`, `\D`, a negated class or an unescaped dot each could match one.
 */
export function underscoreFree(pattern: string): boolean {
  let inClass = false;
  for (let k = 0; k < pattern.length; k++) {
    const c = pattern[k]!;
    if (c === "\\") {
      if (/[wWSDpPu]/.test(pattern[k + 1] ?? "")) return false;
      k++;
    } else if (c === "_") return false;
    else if (c === "[" && !inClass) {
      inClass = true;
      if (pattern[k + 1] === "^") return false;
    } else if (c === "]") inClass = false;
    else if (c === "." && !inClass) return false;
  }
  return true;
}
