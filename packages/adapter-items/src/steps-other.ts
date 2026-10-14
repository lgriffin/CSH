// Step definitions in Python, Java, Go and Rust (stage 59): what behave, Cucumber-JVM, godog and cucumber-rs register,
// read from the code with nothing run, so the scenarios of a feature practice are matched against them as they are
// against cucumber-js's. A definition CSH cannot read (a computed pattern, a regular expression that does not compile)
// is kept as unreadable: it could match any step.
import type { StepPattern } from "./tests.ts";
import { type Language, lexOther, lineIndex, lineStarts } from "./tests-other.ts";

export interface StepDefinition {
  line: number;
  /** The literal text, for citing identifiers; empty for a regular expression. */
  title: string;
  pattern: StepPattern;
}

/** A string's content as the language reads it: escapes resolved, unless the literal is raw. */
function unescape(raw: string): string {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, e: string) => {
    if (e === "n") return "\n";
    if (e === "t") return "\t";
    if (e === "r") return "\r";
    if (e.startsWith("u{")) return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (e.startsWith("u") || e.startsWith("x")) return e.length > 1 ? String.fromCharCode(parseInt(e.slice(1), 16)) : e;
    return e;
  });
}

const compiles = (source: string): boolean => {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
};

const regex = (source: string): StepPattern => (compiles(source) ? { k: "regex", source, flags: "" } : { k: "unreadable", text: `/${source}/` });
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * A behave `parse` pattern as a regular expression: each `{name}` or `{name:type}` field matches anything, `{{` and
 * `}}` are braces, and everything else is literal, parentheses and slashes included (a Cucumber expression would read
 * those as optional text and alternatives).
 */
function parseFormat(text: string): StepPattern {
  const parts = text.split(/(\{\{|\}\}|\{[^{}]*\})/);
  const source = parts.map((p) => (p === "{{" ? "\\{" : p === "}}" ? "\\}" : p.startsWith("{") && p.endsWith("}") ? "(.*)" : escapeRegex(p))).join("");
  return regex(`^${source}$`);
}

const skipSpace = (code: string, at: number): number => {
  while (at < code.length && /\s/.test(code[at]!)) at++;
  return at;
};

/**
 * The step definitions of a file:
 * - behave, in a file that imports it (Hypothesis has a `@given` too): `@given`, `@when`, `@then`, `@step` (and the
 *   capitalised aliases), in its default `parse` format, read as a regular expression whose `{name:type}` matches
 *   anything and whose other characters are literal; after `use_step_matcher("re")`, a regular expression.
 * - Cucumber-JVM: `@Given`, `@When`, `@Then`, `@And`, `@But` (`@Step` is Serenity's or Allure's, not a step); a
 *   string that starts with `^` or ends with `$` is a regular expression, any other a Cucumber expression, as
 *   Cucumber-JVM decides.
 * - godog: `.Step`, `.Given`, `.When`, `.Then` called with a string, always a regular expression.
 * - cucumber-rs: `#[given]`, `#[when]`, `#[then]` with `expr = "…"` (a Cucumber expression), `regex = "…"`, or a plain
 *   string, matched exactly.
 */
export function stepDefinitionsOther(text: string, lang: Language): StepDefinition[] {
  const { code, strings } = lexOther(text, lang);
  const starts = lineStarts(text);
  const line = (at: number) => lineIndex(starts, at) + 1;
  const out: StepDefinition[] = [];
  // The rest of the line a definition starts on, as the person wrote it.
  const lineFrom = (at: number) => {
    const end = text.indexOf("\n", at);
    return text.slice(at, end < 0 ? text.length : end).trim();
  };
  const unreadable = (at: number, what: string) => out.push({ line: line(at), title: "", pattern: { k: "unreadable", text: what } });
  // A literal is the whole pattern only when the argument ends with it: `"a" + B` is computed, and could be anything.
  // The lexer blanks a string's content, so the literal ends at the first character that is no space, quote or `#`.
  const whole = (at: number) => /^[\s"'`#]*[,)]/.test(code.slice(at + 1));
  if (lang === "python") {
    if (!/^\s*(?:from\s+behave(?:\.\w+)*\s+import|import\s+behave)\b/m.test(code)) return [];
    // use_step_matcher switches the matcher for the definitions after it in the file.
    const switches = [...code.matchAll(/(?<![\w.])use_step_matcher\s*\(/g)].map((m) => {
      const at = skipSpace(code, m.index + m[0].length);
      return { at: m.index, matcher: strings.get(at) ?? "" };
    });
    for (const m of code.matchAll(/@(?:given|when|then|step|Given|When|Then|Step)\s*\(/g)) {
      let at = skipSpace(code, m.index + m[0].length);
      const prefix = /^[rRuU]{0,2}/.exec(code.slice(at, at + 2))![0];
      at += prefix.length;
      const raw = strings.get(at);
      if (raw === undefined || !whole(at)) {
        unreadable(m.index, lineFrom(m.index));
        continue;
      }
      const value = /[rR]/.test(prefix) ? raw : unescape(raw);
      const matcher = switches.filter((s) => s.at < m.index).pop()?.matcher ?? "parse";
      out.push({ line: line(at), title: value, pattern: matcher === "re" ? regex(value) : parseFormat(value) });
    }
  } else if (lang === "java") {
    for (const m of code.matchAll(/@(?:Given|When|Then|And|But)\s*\(/g)) {
      let at = skipSpace(code, m.index + m[0].length);
      // The annotation's value, written alone or as value = "…".
      const named = /^value\s*=\s*/.exec(code.slice(at));
      if (named !== null) at = skipSpace(code, at + named[0].length);
      const raw = strings.get(at);
      if (raw === undefined || !whole(at)) {
        unreadable(m.index, lineFrom(m.index));
        continue;
      }
      const value = unescape(raw);
      out.push({ line: line(at), title: value, pattern: value.startsWith("^") || value.endsWith("$") ? regex(value) : { k: "expression", text: value } });
    }
  } else if (lang === "go") {
    for (const m of code.matchAll(/\.(?:Step|Given|When|Then)\s*\(/g)) {
      const at = skipSpace(code, m.index + m[0].length);
      const raw = strings.get(at);
      if (raw === undefined || !whole(at)) {
        unreadable(m.index, lineFrom(m.index));
        continue;
      }
      out.push({ line: line(at), title: "", pattern: regex(text[at] === "`" ? raw : unescape(raw)) });
    }
  } else if (lang === "rust") {
    for (const m of code.matchAll(/#\[\s*(?:given|when|then)\s*\(/g)) {
      let at = skipSpace(code, m.index + m[0].length);
      const kind = /^(expr|regex)\s*=\s*/.exec(code.slice(at));
      if (kind !== null) at = skipSpace(code, at + kind[0].length);
      const rawPrefix = /^r#*/.exec(code.slice(at))?.[0] ?? "";
      at += rawPrefix.length;
      const raw = strings.get(at);
      if (raw === undefined || !whole(at)) {
        unreadable(m.index, lineFrom(m.index));
        continue;
      }
      const value = rawPrefix !== "" ? raw : unescape(raw);
      const pattern: StepPattern = kind?.[1] === "regex" ? regex(value) : kind?.[1] === "expr" ? { k: "expression", text: value } : { k: "regex", source: `^${escapeRegex(value)}$`, flags: "" };
      out.push({ line: line(at), title: kind?.[1] === "regex" ? "" : value, pattern });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}
