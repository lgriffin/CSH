// A small XML reader (stage 29) for the XML CSH reads as data: JUnit reports and Maven's pom.xml. It reads elements,
// attributes, text, CDATA, comments, processing instructions and a doctype, and the five predefined entities and
// numeric character references. It never fetches or expands an external entity. Malformed input is a problem with its
// line, never a silently partial tree.

export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  /** The element's own text, CDATA included, children's text excluded. */
  text: string;
  /** The 1-based line the start tag is on. */
  line: number;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

class Malformed extends Error {}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, e: string) => {
    if (!e.startsWith("#")) return ENTITIES[e] ?? whole;
    const code = e.startsWith("#x") ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
    if (!(code <= 0x10ffff)) throw new Malformed(`character reference ${whole} is out of range`);
    return String.fromCodePoint(code);
  });
}

/** The root element of a document, or the first problem. */
export function parseXml(text: string): { root?: XmlElement; problems: { line: number; message: string }[] } {
  const at = { line: 1 };
  try {
    return read(text, at);
  } catch (err) {
    if (err instanceof Malformed) return { problems: [{ line: at.line, message: err.message }] };
    throw err;
  }
}

function read(text: string, at: { line: number }): { root?: XmlElement; problems: { line: number; message: string }[] } {
  let i = 0;
  let line = 1;
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  const advance = (to: number) => {
    for (let k = i; k < to; k++) if (text.charCodeAt(k) === 10) line++;
    i = to;
    at.line = line;
  };
  const fail = (message: string) => ({ problems: [{ line, message }] });
  const skipTo = (marker: string): boolean => {
    const e = text.indexOf(marker, i);
    if (e < 0) return false;
    advance(e + marker.length);
    return true;
  };
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    const chunk = lt < 0 ? text.slice(i) : text.slice(i, lt);
    if (stack.length > 0) stack[stack.length - 1]!.text += decodeEntities(chunk);
    else if (chunk.trim() !== "") return fail("text outside the root element");
    if (lt < 0) {
      advance(text.length);
      break;
    }
    advance(lt);
    if (text.startsWith("<!--", i)) {
      if (!skipTo("-->")) return fail("unterminated comment");
    } else if (text.startsWith("<![CDATA[", i)) {
      const e = text.indexOf("]]>", i);
      if (e < 0) return fail("unterminated CDATA");
      if (stack.length === 0) return fail("CDATA outside the root element");
      stack[stack.length - 1]!.text += text.slice(i + 9, e);
      advance(e + 3);
    } else if (text.startsWith("<?", i)) {
      if (!skipTo("?>")) return fail("unterminated processing instruction");
    } else if (text.startsWith("<!", i)) {
      // A doctype, with any internal subset; its entities are not expanded.
      const bracket = text.indexOf("[", i);
      const close = text.indexOf(">", i);
      if (close < 0) return fail("unterminated doctype");
      if (bracket >= 0 && bracket < close) {
        if (!skipTo("]") || !skipTo(">")) return fail("unterminated doctype");
      } else advance(close + 1);
    } else if (text.startsWith("</", i)) {
      const m = /^<\/([^\s>]+)\s*>/.exec(text.slice(i));
      if (m === null) return fail("malformed end tag");
      const open = stack.pop();
      if (open === undefined || open.name !== m[1]) return fail(`end tag ${m[1]} does not close ${open?.name ?? "anything"}`);
      advance(i + m[0].length);
    } else {
      // An attribute value holds no raw "<" (XML 1.0, AttValue).
      const m = /^<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/.exec(text.slice(i));
      if (m === null) return fail("malformed start tag");
      const el: XmlElement = { name: m[1]!, attributes: {}, children: [], text: "", line };
      for (const a of m[2]!.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        if (Object.hasOwn(el.attributes, a[1]!)) return fail(`attribute ${a[1]} is repeated`);
        el.attributes[a[1]!] = decodeEntities(a[2] ?? a[3] ?? "");
      }
      if (stack.length > 0) stack[stack.length - 1]!.children.push(el);
      else if (root !== undefined) return fail("a second root element");
      else root = el;
      advance(i + m[0].length);
      if (m[3] !== "/") stack.push(el);
    }
  }
  if (stack.length > 0) return fail(`unclosed element ${stack[stack.length - 1]!.name}`);
  if (root === undefined) return fail("no root element");
  return { root, problems: [] };
}

/** The children of an element with a name. */
export const childrenNamed = (el: XmlElement, name: string): XmlElement[] => el.children.filter((c) => c.name === name);
