// pytest-bdd (From the Toads run, sections 2 and 3; stage 62): a module's bindings and its step definitions, read from
// the code with nothing run.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { literalAt, pytestBddBindings, pytestBddImports, pytestBddSteps, unescapePython } from "../src/pytest-bdd.ts";
import { lexOther } from "../src/tests-other.ts";

const shown = (text: string) => pytestBddSteps(text).map((d) => [d.line, d.pattern.k, d.pattern.k === "regex" ? d.pattern.source : d.pattern.text]);

describe("pytest-bdd imports", () => {
  it("follows aliases, the parsers module and a plain import", () => {
    const i = pytestBddImports("from pytest_bdd import (\n    given,\n    then as expect,\n)\nfrom pytest_bdd.parsers import parse as fmt\nimport pytest_bdd\n")!;
    expect([...i.names]).toEqual([["given", "given"], ["expect", "then"]]);
    expect([...i.parsers]).toEqual([["fmt", "parse"]]);
    expect(i.module).toEqual(["pytest_bdd"]);
  });
  it("is undefined for a file that does not import pytest_bdd, whatever it mentions", () => {
    expect(pytestBddImports("from hypothesis import given\n# from pytest_bdd import given\n".replace(/#.*$/m, "  "))).toBeUndefined();
  });
});

describe("literals", () => {
  const lit = (src: string) => {
    const { code, strings } = lexOther(src, "python");
    return literalAt(src, code, strings, 0)?.value;
  };
  it("joins adjacent literals, reads escapes unless raw, and calls an f-string with a field computed", () => {
    expect(lit('"a " \n  \'b\'')).toBe("a b");
    expect(lit('"it\\\'s\\n"')).toBe("it's\n");
    expect(lit('r"\\d+"')).toBe("\\d+");
    expect(lit('f"{name}.feature"')).toBeUndefined();
    expect(lit('f"plain {{x}}"')).toBe("plain {{x}}");
    expect(lit("name")).toBeUndefined();
  });
  it("reads a literal with no escapes as itself", () => {
    fc.assert(fc.property(fc.string({ unit: fc.constantFrom("a", " ", ".", "{", "}", "(", "-") }), (t) => lit(JSON.stringify(t)) === t && unescapePython(t) === t));
  });
});

describe("pytest-bdd bindings", () => {
  it("reads scenarios() by its feature literals, and @scenario by its literal title", () => {
    const b = pytestBddBindings(['from pytest_bdd import scenario, scenarios', 'scenarios(str(FEATURES / "orders.feature"), "../x/refunds.feature")', "", '@scenario(str(F), "REQ-1 an " "order")', "def test_a():", "    pass", ""].join("\n"))!;
    expect(b).toMatchObject({ features: ["../x/refunds.feature", "orders.feature"], titles: ["REQ-1 an order"], named: [], undecided: [], binds: true });
  });
  it("reads a computed scenarios() as binding each literal name, and a computed title as undecided", () => {
    const b = pytestBddBindings(['from pytest_bdd import scenario, scenarios', 'for n in ("shipping", "returns"):', '    scenarios(str(F / f"{n}.feature"))', "", 'def _bind(n):', '    return scenario(str(F / "accounts.feature"), title(n))', ""].join("\n"))!;
    expect(b.features).toEqual([]);
    expect(b.named).toEqual(expect.arrayContaining(["shipping", "returns", "accounts"]));
    expect(b.undecided).toEqual(["accounts.feature"]);
    expect(b.titles).toEqual([]);
  });
  it("reads nothing in a file that does not import pytest_bdd, and does not take a def for a call", () => {
    expect(pytestBddBindings('def scenarios(x):\n    pass\nscenarios("a.feature")\n')).toBeUndefined();
    expect(pytestBddBindings('from pytest_bdd import given\ndef scenario(x):\n    pass\n')!.binds).toBe(false);
  });
});

describe("pytest-bdd step definitions", () => {
  it("reads plain text, parse and cfparse formats, and regular expressions over the whole step", () => {
    const py = [
      "from pytest_bdd import given, parsers, when", // 1
      "from pytest_bdd import then as expect", // 2
      "", // 3
      '@given(parsers.parse("a basket holding {count:d} items"), target_fixture="b")', // 4
      "def a(count): pass", // 5
      "@when(parsers.re(r'the member adds \"(?P<item>[^\"]+)\"'))", // 6
      "def b(item): pass", // 7
      "@when(", // 8
      '    "the member empties "', // 9
      '    "the basket (twice)"', // 10
      ")", // 11
      "def c(): pass", // 12
      "@expect(parsers.cfparse('{n:d} left'))", // 13
      "def d(n): pass", // 14
      "@expect(parsers.string('a.b'))", // 15
      "def e(): pass", // 16
      "@expect(make_parser('x'))", // 17
      "def f(): pass", // 18
      '@expect("a " + NAME)', // 19
      "def g(): pass", // 20
      "",
    ].join("\n");
    expect(shown(py)).toEqual([
      [4, "regex", "^a basket holding (.*) items$"],
      [6, "regex", '^(?:the member adds "(?<item>[^"]+)")$'],
      [9, "regex", "^the member empties the basket \\(twice\\)$"],
      [13, "regex", "^(.*) left$"],
      [15, "regex", "^a\\.b$"],
      [17, "unreadable", "@expect(make_parser('x'))"],
      [19, "unreadable", '@expect("a " + NAME)'],
    ]);
  });
  it("reads no Hypothesis @given, and nothing in a file that does not import pytest_bdd", () => {
    expect(shown("from pytest_bdd import scenarios\nfrom hypothesis import given\n\n@given(st.integers())\ndef test_x(n): pass\n")).toEqual([]);
    expect(shown('from behave_like import given\n\n@given("a step")\ndef a(): pass\n')).toEqual([]);
  });
  it("matches a regular expression only over the whole step, as pytest-bdd does", () => {
    const d = pytestBddSteps('from pytest_bdd import then, parsers\n@then(parsers.re(r"the basket is empty"))\ndef x(): pass\n')[0]!;
    const re = new RegExp(d.pattern.k === "regex" ? d.pattern.source : "");
    expect(re.test("the basket is empty")).toBe(true);
    expect(re.test("the basket is empty for good")).toBe(false);
  });
});
