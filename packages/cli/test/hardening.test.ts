// The command line as a person meets it (stage 64): every mistake on the command line is named on standard error with
// the command's usage and exit code 2, a file that cannot be read is said rather than thrown, and an error nothing
// expected is one line, never a stack trace.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { csh, csl } from "../src/index.ts";
import { USAGE } from "../src/commands.ts";

const BIN = resolve(import.meta.dirname, "../bin");
let dir: string;

function io(cwd: string) {
  const o = { out: "", err: "" };
  return { o, io: { out: (s: string) => void (o.out += s), err: (s: string) => void (o.err += s), cwd } };
}

async function cshIn(cwd: string, ...argv: string[]) {
  const { o, io: x } = io(cwd);
  const code = await csh(argv, x);
  return { code, ...o };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "csh-hardening-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("csh help and version", () => {
  it("prints the usage on standard output for help, --help and -h, and exits 0", async () => {
    for (const argv of [["help"], ["--help"], ["-h"]]) {
      const r = await cshIn(dir, ...argv);
      expect(r.code).toBe(0);
      expect(r.out).toBe(USAGE);
      expect(r.err).toBe("");
    }
  });

  it("prints the usage on standard error, and exits 2, when no command is given", async () => {
    const r = await cshIn(dir);
    expect(r).toMatchObject({ code: 2, out: "", err: USAGE });
  });

  it("prints one command's help for csh help <command> and csh <command> --help", async () => {
    for (const argv of [["help", "diff"], ["diff", "--help"], ["diff", "-h"]]) {
      const r = await cshIn(dir, ...argv);
      expect(r.code).toBe(0);
      expect(r.out).toMatch(/^ {2}csh diff <base> <head>/);
      expect(r.out).not.toMatch(/csh queue/);
      expect(r.out).toMatch(/Exit codes:/);
    }
  });

  it("refuses help for a command that does not exist", async () => {
    const r = await cshIn(dir, "help", "overveiw");
    expect(r).toMatchObject({ code: 2, out: "", err: 'csh help: no command "overveiw"; did you mean overview?\n' });
  });

  it("refuses help with more than a command, and --version asked of a command", async () => {
    expect(await cshIn(dir, "help", "status", "extra")).toMatchObject({ code: 2, err: 'csh help: takes at most 1 argument; "extra" is extra\nusage: csh help [command]\n' });
    expect((await cshIn(dir, "help", "status", "--bogus")).code).toBe(2);
    const v = await cshIn(dir, "status", "--version");
    expect(v.code).toBe(2);
    expect(v.err).toMatch(/^csh status: unknown option --version\n/);
  });

  it("prints the version", async () => {
    const r = await cshIn(dir, "--version");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^csh \d+\.\d+\.\d+\n$/);
  });
});

describe("csh usage errors", () => {
  it("names an unknown command with the nearest one", async () => {
    const r = await cshIn(dir, "chek");
    expect(r).toMatchObject({ code: 2, out: "", err: 'csh: unknown command "chek"; did you mean check?\nRun csh help for the list of commands.\n' });
  });

  it("names an unknown option, with the command's usage", async () => {
    const r = await cshIn(dir, "status", "--josn");
    expect(r.code).toBe(2);
    expect(r.err).toBe("csh status: unknown option --josn; did you mean --json?\nusage: csh status [--json]\nRun csh help status for more.\n");
  });

  it("names every problem at once, and gives each synopsis of the command", async () => {
    const r = await cshIn(dir, "gate", "x", "--budget", "soon", "--mode", "strict");
    expect(r.code).toBe(2);
    expect(r.err.split("\n").slice(0, 3)).toEqual(['csh gate: takes no arguments, and has "x"', 'csh gate: --budget is a whole number of milliseconds above 0, not "soon"', 'csh gate: --mode is advisory or enforcing, not "strict"']);
    expect(r.err).toMatch(/usage: csh gate \[--mode advisory\|enforcing\] \[--out decision.json\]\n {7}csh gate --verify <decision.json>\n/);
  });

  it("refuses a missing positional before reading anything", async () => {
    for (const cmd of ["explain", "approve", "analyse", "history"]) {
      const r = await cshIn(dir, cmd);
      expect(r.code, cmd).toBe(2);
      expect(r.err, cmd).toMatch(new RegExp(`^csh ${cmd}: expects 1 argument, and has 0\\nusage: csh ${cmd} `));
    }
  });

  it("checks each a3 subcommand against what it takes", async () => {
    const extra = await cshIn(dir, "a3", "open", "slug", "extra");
    expect(extra.code).toBe(2);
    expect(extra.err).toMatch(/^csh a3: takes at most 2 arguments; "extra" is extra\n/);
    expect((await cshIn(dir, "a3", "build", "slug", "--at", "HEAD")).err).toMatch(/^csh a3: unknown option --at\n/);
    expect((await cshIn(dir, "a3", "biuld", "slug")).err).toMatch(/^csh a3: no subcommand "biuld"; did you mean build\?; there are open, stage, build, verify\n/);
    expect((await cshIn(dir, "a3", "stage", "slug")).err).toMatch(/^csh a3: expects 3 arguments, and has 2\n/);
  });

  it("takes any whole budget a number holds exactly, and no more", async () => {
    expect((await cshIn(dir, "check", "--budget", "1000000000", "--root", join(dir, "nowhere"))).err).not.toMatch(/--budget/);
    expect((await cshIn(dir, "check", "--budget", "99999999999999999999")).err).toMatch(/--budget is a whole number/);
  });

  it("lets csh init name a root it will create, and refuses one that is a file", async () => {
    const created = join(dir, "new-profile");
    const r = await cshIn(dir, "init", "--root", created, "--subject", join(dir, "nowhere"));
    expect(r.err).not.toMatch(/--root/);
    expect(r).toMatchObject({ code: 2, err: `csh init: --subject ${join(dir, "nowhere")} is not a directory\n` });
    writeFileSync(join(dir, "a-root-file"), "");
    expect((await cshIn(dir, "init", "--root", "a-root-file")).err).toBe("csh init: --root a-root-file is not a directory\n");
  });

  it("refuses a --root or --subject that is not a directory", async () => {
    const r = await cshIn(dir, "status", "--root", join(dir, "nowhere"));
    expect(r).toMatchObject({ code: 2, err: `csh status: --root ${join(dir, "nowhere")} is not a directory\n` });
    writeFileSync(join(dir, "a-file"), "");
    const s = await cshIn(dir, "run", "--subject", "a-file");
    expect(s).toMatchObject({ code: 2, err: "csh run: --subject a-file is not a directory\n" });
  });

  it("checks a decision's seq and waiver before running anything", async () => {
    const c = await cshIn(dir, "countersign", "first", "--actor", "a", "--rationale", "r");
    expect(c).toMatchObject({ code: 2, err: 'csh countersign: a ledger entry is named by its seq, a whole number from 1, not "first"\n' });
    const w = await cshIn(dir, "waive", "X", "--scope", "f1", "--expires", "next week", "--actor", "a", "--rationale", "r");
    expect(w).toMatchObject({ code: 2, err: "csh waive needs --scope <finding-id|obligation> and --expires <YYYY-MM-DD>\n" });
  });
});

describe("csh on files it cannot use", () => {
  it("says there is nothing to evaluate in a directory with no manifest, and exits 1", async () => {
    const r = await cshIn(dir, "check");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/^nothing to evaluate in .*: no specification given and neither csh\/component.json nor csh\/config.json names one; csh init writes a manifest/);
  });

  it("refuses a decision file that is missing or is not a decision", async () => {
    const missing = await cshIn(dir, "gate", "--verify", "nope.json");
    expect(missing).toMatchObject({ code: 2, err: "csh gate --verify: nope.json is not a decision csh gate wrote (no such file)\n" });
    writeFileSync(join(dir, "bad.json"), "{ not json");
    const bad = await cshIn(dir, "gate", "--verify", "bad.json");
    expect(bad.code).toBe(2);
    expect(bad.err).toMatch(/^csh gate --verify: bad.json is not a decision csh gate wrote \(not JSON: /);
  });

  it("refuses a report that is not one, and names it", async () => {
    mkdirSync(join(dir, "reports"), { recursive: true });
    writeFileSync(join(dir, "reports", "csh-report.json"), "[]");
    for (const cmd of ["overview", "ladder", "expect"]) {
      if (cmd === "expect") writeFileSync(join(dir, "expected.json"), JSON.stringify({ schema: "csh-expected/v1", rows: [{ row: 1, title: "t", expect: [{ outcome: "converged", kind: "satisfied", subject: "X" }] }] }));
      const r = await cshIn(dir, cmd, ...(cmd === "expect" ? ["--expected", "expected.json"] : []));
      expect(r.code, cmd).toBe(2);
      expect(r.err, cmd).toMatch(new RegExp(`^csh ${cmd}: reports/csh-report.json is not a report csh wrote`));
    }
    rmSync(join(dir, "reports"), { recursive: true });
  });

  it("names the model explain cannot read", async () => {
    mkdirSync(join(dir, "reports"), { recursive: true });
    writeFileSync(join(dir, "reports", "csh-report.json"), JSON.stringify({ findings: [{ id: "f1", kind: "state-conflict", members: [] }] }));
    const r = await cshIn(dir, "explain", "f1");
    expect(r).toMatchObject({ code: 2, err: "csh explain: cannot read the model at reports/csh-model.json (no such file); csh check writes it beside the report\n" });
    rmSync(join(dir, "reports"), { recursive: true });
  });

  it("says an unexpected error in one line, and exits 1", async () => {
    mkdirSync(join(dir, "csh"), { recursive: true });
    writeFileSync(join(dir, "csh", "config.json"), "{ broken");
    const r = await cshIn(dir, "status");
    rmSync(join(dir, "csh"), { recursive: true });
    expect(r.code).toBe(1);
    expect(r.err.split("\n")[0]).toMatch(/^csh status: .*JSON/);
    expect(r.err).toMatch(/Set CSH_DEBUG=1 to see where it came from\.\n$/);
    expect(r.err).not.toMatch(/\n\s+at /);
  });
});

describe("csl usage errors", () => {
  async function cslIn(...argv: string[]) {
    const { o, io: x } = io(dir);
    return { code: await csl(argv, x), ...o };
  }

  it("prints its usage for --help, its version for --version, and refuses no command", async () => {
    expect((await cslIn("--help")).code).toBe(0);
    expect((await cslIn("--version")).out).toMatch(/^csl \d+\.\d+\.\d+\n$/);
    expect((await cslIn()).code).toBe(2);
  });

  it("refuses a command with no file, an unknown option and a file that is not there", async () => {
    expect((await cslIn("emit")).err).toMatch(/^csl emit: expects 1 argument, and has 0\n/);
    expect((await cslIn("emit", "x.ts", "--otu", "m.json")).err).toMatch(/^csl emit: unknown option --otu; did you mean --out\?\n/);
    expect(await cslIn("print", "missing.json")).toMatchObject({ code: 2, err: "csl print: no file missing.json\n" });
    expect((await cslIn("lokc", "x")).err).toMatch(/^csl: unknown command "lokc"; did you mean lock\?\n/);
  });

  it("says a model that is not JSON in one line", async () => {
    writeFileSync(join(dir, "model.json"), "nope");
    const r = await cslIn("print", "model.json");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/^csl print: .*JSON/);
  });
});

describe.skipIf(process.platform === "win32")("the bin scripts", () => {
  it("print the version and exit 0", () => {
    for (const bin of ["csh", "csl"]) {
      const r = spawnSync(process.execPath, [join(BIN, `${bin}.js`), "--version"], { encoding: "utf8" });
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(new RegExp(`^${bin} \\d+\\.\\d+\\.\\d+\\n$`));
    }
  });

  it("end quietly with the command's code when the reader closes the pipe early", () => {
    // A command that writes far more than a pipe holds, read by head, which closes the pipe after one line.
    const exit = pathToFileURL(resolve(import.meta.dirname, "../src/exit.ts")).href;
    const script = `import { main } from ${JSON.stringify(exit)}; await main("t", async (_, io) => { for (let i = 0; i < 4000; i++) io.out("x".repeat(100) + "\\n"); return 0; });`;
    const r = spawnSync("bash", ["-c", `set -o pipefail; "${process.execPath}" --input-type=module -e '${script}' | head -n 1 >/dev/null`], { encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    // A command still working when the pipe closes runs to its end, and its own code is the exit: a block stays a block.
    const late = `import { main } from ${JSON.stringify(exit)}; await main("t", async (_, io) => { for (let i = 0; i < 4000; i++) io.out("x".repeat(100) + "\\n"); await new Promise((r) => setTimeout(r, 50)); io.out("done\\n"); return 3; });`;
    const blocked = spawnSync("bash", ["-c", `"${process.execPath}" --input-type=module -e '${late}' | head -n 1 >/dev/null; echo "\${PIPESTATUS[0]}"`], { encoding: "utf8" });
    expect(blocked.stdout.trim()).toBe("3");
  });

  it("print an error nothing expected as one line, and its stack with CSH_DEBUG=1", () => {
    const exit = pathToFileURL(resolve(import.meta.dirname, "../src/exit.ts")).href;
    const script = `import { main } from ${JSON.stringify(exit)}; await main("t", async () => { throw new Error("boom"); });`;
    const quiet = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: { ...process.env, CSH_DEBUG: "" } });
    expect(quiet.status).toBe(1);
    expect(quiet.stderr).toBe("t: boom\nSet CSH_DEBUG=1 to see where it came from.\n");
    const loud = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: { ...process.env, CSH_DEBUG: "1" } });
    expect(loud.status).toBe(1);
    expect(loud.stderr).toMatch(/^t: boom\nError: boom\n\s+at /);
  });
});
