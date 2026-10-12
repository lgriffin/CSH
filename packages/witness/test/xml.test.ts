import { describe, expect, it } from "vitest";
import { parseXml } from "../src/xml.ts";

describe("parseXml", () => {
  it("reads elements, attributes, text, CDATA and entities, with lines", () => {
    const { root, problems } = parseXml(`<?xml version="1.0"?>\n<!-- c -->\n<a x="1 &amp; 2" y='q'>\n  t&lt;1&#65;\n  <b/><c><![CDATA[<raw>]]></c>\n</a>\n`);
    expect(problems).toEqual([]);
    expect(root!.name).toBe("a");
    expect(root!.attributes).toEqual({ x: "1 & 2", y: "q" });
    expect(root!.text.trim()).toBe("t<1A");
    expect(root!.line).toBe(3);
    expect(root!.children.map((c) => [c.name, c.text, c.line])).toEqual([
      ["b", "", 5],
      ["c", "<raw>", 5],
    ]);
  });

  it("skips a doctype with an internal subset and never expands its entities", () => {
    const { root, problems } = parseXml(`<!DOCTYPE a [<!ENTITY e "x">]><a>&e;</a>`);
    expect(problems).toEqual([]);
    expect(root!.text).toBe("&e;");
  });

  it.each([
    ["<a><b></a>", "end tag a does not close b"],
    ["<a>", "unclosed element a"],
    ["<a/><b/>", "a second root element"],
    ["", "no root element"],
    ["x<a/>", "text outside the root element"],
    ["<a><!-- x</a>", "unterminated comment"],
  ])("reports %j", (text, message) => {
    expect(parseXml(text).problems[0]!.message).toBe(message);
  });
});
