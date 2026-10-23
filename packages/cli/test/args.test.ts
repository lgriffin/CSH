import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { argProblems, nearest, parseArgs, valueProblems } from "../src/args.ts";
import { COMMAND_NAMES, COMMANDS, commandNamed, synopsis, USAGE } from "../src/commands.ts";

describe("parseArgs", () => {
  it("reads positionals, --key value, --key=value and flags", () => {
    const a = parseArgs(["check", "spec.csl.ts", "--out", "r.json", "--budget=500", "--json"]);
    expect(a.positional).toEqual(["check", "spec.csl.ts"]);
    expect(a.options).toEqual({ out: "r.json", budget: "500" });
    expect([...a.flags]).toEqual(["json"]);
    expect(a.errors).toEqual([]);
  });

  it("ends the options at --, and reads -h as --help", () => {
    const a = parseArgs(["explain", "-h", "--", "--not-an-option", "x"]);
    expect(a.positional).toEqual(["explain", "--not-an-option", "x"]);
    expect(a.flags.has("help")).toBe(true);
  });

  it("refuses a value for a flag, an empty value and an option given twice", () => {
    expect(parseArgs(["--json=yes"]).errors).toEqual(["--json takes no value"]);
    expect(parseArgs(["--out="]).errors).toEqual(["--out needs a value"]);
    expect(parseArgs(["--out", "a", "--out", "b"]).errors).toEqual(["--out is given twice"]);
  });

  it("keeps an option with no value after it as a flag, for the command to judge", () => {
    const a = parseArgs(["--out", "--json"]);
    expect([...a.flags].sort()).toEqual(["json", "out"]);
    expect(a.errors).toEqual([]);
  });

  it("takes a value that starts with a single dash", () => {
    expect(parseArgs(["--rationale", "-5 is the floor"]).options.rationale).toBe("-5 is the floor");
  });
});

describe("argProblems", () => {
  const run = commandNamed("run")!;

  it("accepts the command's options, its flags and the common ones", () => {
    expect(argProblems(parseArgs(["--at", "HEAD", "--mode", "enforcing", "--no-cache", "--root", "x", "--subject", "y"]), run)).toEqual([]);
  });

  it("names an unknown option with the nearest one the command accepts", () => {
    expect(argProblems(parseArgs(["--moed", "advisory"]), run)).toEqual(["unknown option --moed; did you mean --mode?"]);
    expect(argProblems(parseArgs(["--josn"]), commandNamed("status")!)).toEqual(["unknown option --josn; did you mean --json?"]);
    expect(argProblems(parseArgs(["--frobnicate"]), run)).toEqual(["unknown option --frobnicate"]);
  });

  it("tells an option missing its value from a flag given one", () => {
    expect(argProblems(parseArgs(["--at"]), run)).toEqual(["--at needs a value"]);
    expect(argProblems({ positional: [], options: { "no-cache": "1" }, flags: new Set(), errors: [] }, run)).toEqual(["--no-cache takes no value"]);
  });

  it("counts positionals", () => {
    expect(argProblems(parseArgs(["a"]), run)).toEqual(['takes no arguments, and has "a"']);
    expect(argProblems(parseArgs([]), commandNamed("diff")!)).toEqual(["expects 2 arguments, and has 0"]);
    expect(argProblems(parseArgs(["a", "b", "c"]), commandNamed("diff")!)).toEqual(['takes at most 2 arguments; "c" is extra']);
    expect(argProblems(parseArgs(["open"]), commandNamed("a3")!)).toEqual(["expects at least 2 arguments, and has 1"]);
  });
});

describe("valueProblems", () => {
  it("wants a budget that is a whole number of milliseconds above 0", () => {
    expect(valueProblems(parseArgs(["--budget", "5000"]))).toEqual([]);
    for (const b of ["0", "-1", "1.5", "abc", "1e3", "99999999999"]) expect(valueProblems(parseArgs([`--budget=${b}`]))).toHaveLength(1);
  });

  it("wants a mode that is advisory or enforcing", () => {
    expect(valueProblems(parseArgs(["--mode", "enforcing"]))).toEqual([]);
    expect(valueProblems(parseArgs(["--mode", "strict"]))).toEqual(['--mode is advisory or enforcing, not "strict"']);
  });
});

describe("nearest", () => {
  it("finds a word within two edits, and one for short words", () => {
    expect(nearest("chek", COMMAND_NAMES)).toBe("check");
    expect(nearest("overveiw", COMMAND_NAMES)).toBe("overview");
    expect(nearest("rn", COMMAND_NAMES)).toBe("run");
    expect(nearest("zz", COMMAND_NAMES)).toBeUndefined();
  });
});

describe("the command table", () => {
  it("names each command once, and gives each a synopsis in the usage", () => {
    expect(new Set(COMMAND_NAMES).size).toBe(COMMAND_NAMES.length);
    for (const c of COMMANDS) {
      expect(synopsis(c).length).toBeGreaterThan(0);
      for (const n of c.names.filter((x) => x !== "help")) expect(synopsis(c).some((s) => s.startsWith(`csh ${n}`))).toBe(true);
    }
  });

  it("lists in each synopsis only options the command accepts", () => {
    for (const c of COMMANDS) {
      for (const s of synopsis(c)) {
        for (const [, k] of s.matchAll(/--([a-z-]+)/g)) expect([...(c.options ?? []), ...(c.flags ?? []), "root", "subject", "help", "version"], `${s}`).toContain(k);
      }
    }
  });

  it("states the exit codes", () => {
    expect(USAGE).toMatch(/Exit codes: 0 .*; 1 .*; 2 a usage error/s);
  });
});

describe("the documentation of the command line", () => {
  const repo = resolve(import.meta.dirname, "../../..");

  it("quotes csh help in full in the command line guide", () => {
    const guide = readFileSync(resolve(repo, "docs/guides/cli.md"), "utf8").replace(/\r\n/g, "\n");
    expect(guide).toContain(`\`\`\`text\n${USAGE}\`\`\``);
  });

  it("names every command in the README", () => {
    const readme = readFileSync(resolve(repo, "README.md"), "utf8");
    const section = readme.slice(readme.indexOf("## Using the command line"), readme.indexOf("## How to read a report"));
    for (const n of COMMAND_NAMES.filter((x) => x !== "help")) expect(section, n).toContain(`\`csh ${n}`);
  });
});
