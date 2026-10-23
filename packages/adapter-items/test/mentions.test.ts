// What a test file's code mentions (Reading test suites as evidence, section 4; stage 72, A-264): identifiers in code
// count, and text in comments, strings and regular expressions does not.
import { describe, expect, it } from "vitest";
import { lex, mentionsOf } from "../src/tests.ts";

describe("mentionsOf", () => {
  it("reads the code inside a template's interpolations, nested too, and not its text", () => {
    const m = mentionsOf("a.test.ts", "const s = `Prose ${render(Total)} and ${`${deep(Inner)}`} \\${Escaped}`;\n")!;
    expect(m.identifiers).toEqual(expect.arrayContaining(["render", "Total", "deep", "Inner"]));
    expect(m.identifiers).not.toContain("Prose");
    expect(m.identifiers).not.toContain("Escaped");
  });

  it("leaves out a regular expression after a keyword such as return", () => {
    const m = mentionsOf("a.test.ts", "function f() { return /PriceLine/.test(x); }\nconst y = a / Divided / 2;\n")!;
    expect(m.identifiers).not.toContain("PriceLine");
    expect(m.identifiers).toEqual(expect.arrayContaining(["Divided", "test", "x"]));
    expect(lex("typeof /re/").code).toBe("typeof /  /");
  });

  it("reads the other languages with their own lexers, and nothing it has no lexer for", () => {
    expect(mentionsOf("t/test_a.py", "# CountVotes\nassert count_votes() == 'BreakTie'\n")!.identifiers).toEqual(["assert", "count_votes"]);
    expect(mentionsOf("notes.txt", "x")).toBeUndefined();
  });
});
