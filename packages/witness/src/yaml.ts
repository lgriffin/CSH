// A small YAML reader (the subset trace files use), shared by the trace adapter and the code-facts adapter.

export type Value = string | number | boolean | null | Value[] | { [k: string]: Value };

/** The line each mapping and sequence began on, for spans. */
export const LINES = new WeakMap<object, number>();

interface Line {
  n: number;
  indent: number;
  text: string;
}

/** A comment starts at a # at the line's start or after a space, outside quotes. */
function stripComment(s: string): string {
  let quote: string | undefined;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote !== undefined) {
      if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || s[i - 1] === " " || s[i - 1] === "\t")) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}

/** Whether a quoted scalar has its closing quote: a double quote not escaped, or a single quote not doubled. */
function closed(s: string): boolean {
  const q = s[0]!;
  for (let i = 1; i < s.length; i++) {
    if (q === '"' && s[i] === "\\") i++;
    else if (s[i] === q) {
      if (q === "'" && s[i + 1] === "'") i++;
      else return true;
    }
  }
  return false;
}

/** Where the key of `key: value` ends, outside quotes; -1 when the line is not a mapping entry. */
function keyEnd(s: string): number {
  let quote: string | undefined;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote !== undefined) {
      if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "[" || c === "{") return -1;
    else if (c === ":" && (i === s.length - 1 || s[i + 1] === " ")) return i;
  }
  return -1;
}

function scalar(raw: string): Value {
  const s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try {
      return JSON.parse(s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    return inner === "" ? [] : splitFlow(inner).map(scalar);
  }
  if (s === "null" || s === "~" || s === "") return null;
  if (s === "true" || s === "false") return s === "true";
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

/** The items of a flow sequence, split on commas outside quotes. */
function splitFlow(s: string): string[] {
  const out: string[] = [];
  let quote: string | undefined;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote !== undefined) {
      if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ",") {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim());
}

/**
 * A YAML subset: block mappings and sequences, flow sequences of scalars, quoted and plain scalars, plain scalars
 * folded over more-indented lines, and literal or folded block scalars. JSON is YAML, and is read as JSON. Anchors,
 * tags and multiple documents are not read; a line the subset cannot place is a problem, never a guess.
 */
export function parseYaml(text: string): { value: Value; problems: { line: number; message: string }[] } {
  const problems: { line: number; message: string }[] = [];
  if (/^\s*[{[]/.test(text)) {
    try {
      return { value: JSON.parse(text) as Value, problems };
    } catch (err) {
      return { value: null, problems: [{ line: 1, message: `not JSON: ${(err as Error).message}` }] };
    }
  }
  const raw = text.split(/\r?\n/);
  const lines: Line[] = [];
  raw.forEach((l, i) => {
    if (/^\s*(#.*)?$/.test(l) || l.trim() === "---") return;
    lines.push({ n: i + 1, indent: l.length - l.trimStart().length, text: stripComment(l.trimStart()) });
  });
  let at = 0;
  const isItem = (l: Line) => l.text === "-" || l.text.startsWith("- ");

  /** Lines more indented than `indent`, as raw text, for a block scalar. */
  const blockScalar = (indent: number, folded: boolean): string => {
    const parts: string[] = [];
    while (at < lines.length && lines[at]!.indent > indent) parts.push(raw[lines[at++]!.n - 1]!.trim());
    return parts.join(folded ? " " : "\n");
  };

  /** A flow sequence that runs on over lines: its text up to the bracket that closes it. */
  const flow = (first: string): Value => {
    let s = first;
    const depth = (t: string) => [...t].reduce((d, c) => d + (c === "[" ? 1 : c === "]" ? -1 : 0), 0);
    while (depth(s) > 0 && at < lines.length) s += ` ${lines[at++]!.text}`;
    return scalar(s.replace(/,\s*]$/, "]"));
  };

  const value = (indent: number): Value => {
    const l = lines[at];
    if (l === undefined || l.indent < indent) return null;
    if (l.text.startsWith("[")) {
      at++;
      return flow(l.text);
    }
    return isItem(l) ? sequence(l.indent) : mapping(l.indent);
  };

  /** The value after `key:` or `- `, on the same line or below it. */
  const after = (rest: string, indent: number): Value => {
    if (rest === "|" || rest === ">" || /^[|>][-+]?$/.test(rest)) return blockScalar(indent, rest.startsWith(">"));
    if (rest.startsWith("[")) return flow(rest);
    if (rest !== "") {
      let s = rest;
      // A quoted scalar continues on more-indented lines until its closing quote.
      if (/^["']/.test(s)) {
        while (!closed(s) && at < lines.length && lines[at]!.indent > indent) s += ` ${raw[lines[at++]!.n - 1]!.trim()}`;
        return scalar(s);
      }
      // A plain scalar continues on more-indented lines that are not entries of their own.
      if (!/^["'[]/.test(s)) while (at < lines.length && lines[at]!.indent > indent && !isItem(lines[at]!) && keyEnd(lines[at]!.text) < 0) s += ` ${lines[at++]!.text}`;
      return scalar(s);
    }
    const next = lines[at];
    if (next === undefined) return null;
    if (next.indent > indent) return value(next.indent);
    if (next.indent === indent && isItem(next)) return sequence(indent);
    return null;
  };

  /** A more-indented line the entry before it did not take: reported and skipped, so later entries are still read. */
  const stray = (indent: number): boolean => {
    const l = lines[at];
    if (l === undefined || l.indent <= indent) return false;
    problems.push({ line: l.n, message: "a line the YAML subset cannot place" });
    at++;
    return true;
  };

  const mapping = (indent: number): Value => {
    const out: { [k: string]: Value } = {};
    LINES.set(out, lines[at]!.n);
    while (at < lines.length && (stray(indent) || (lines[at] !== undefined && lines[at]!.indent === indent && !isItem(lines[at]!)))) {
      if (at >= lines.length || lines[at]!.indent !== indent || isItem(lines[at]!)) continue;
      const l = lines[at++]!;
      const k = keyEnd(l.text);
      if (k < 0) {
        problems.push({ line: l.n, message: "expected key: value" });
        continue;
      }
      const key = String(scalar(l.text.slice(0, k)));
      out[key] = after(l.text.slice(k + 1).trim(), indent);
    }
    return out;
  };

  const sequence = (indent: number): Value => {
    const out: Value[] = [];
    LINES.set(out, lines[at]!.n);
    while (at < lines.length && (stray(indent) || (lines[at] !== undefined && lines[at]!.indent === indent && isItem(lines[at]!)))) {
      if (at >= lines.length || lines[at]!.indent !== indent || !isItem(lines[at]!)) continue;
      const l = lines[at]!;
      const rest = l.text === "-" ? "" : l.text.slice(2).trimStart();
      if (rest !== "" && keyEnd(rest) >= 0) {
        // `- key: value`: a mapping whose entries sit where `key` does.
        const col = indent + (l.text.length - rest.length);
        lines[at] = { n: l.n, indent: col, text: rest };
        out.push(mapping(col));
      } else {
        at++;
        out.push(after(rest, indent));
      }
    }
    return out;
  };

  const top = lines.length === 0 ? null : value(lines[0]!.indent);
  if (at < lines.length) problems.push({ line: lines[at]!.n, message: "a line the YAML subset cannot place" });
  return { value: top, problems };
}

