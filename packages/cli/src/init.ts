// csh init (Anchor, harnesses and A3, sections 2.1 and 7.1): write csh/component.json by asking for each field. It
// guesses nothing from the repository's layout (P10): every value in the manifest is one a person typed.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { COMPONENT_PATH, COMPONENT_SCHEMA, type ComponentManifest, type Practice, PRACTICE_KINDS, validateManifest } from "@csh/component";
import { stableJson } from "@csh/kernel";

interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  ask?: (question: string) => Promise<string>;
}

/** Questions read one line each from standard input; at its end every answer is empty. */
function stdinAsker(): { ask: (q: string) => Promise<string>; close: () => void } {
  const rl = createInterface({ input: process.stdin, terminal: false });
  const lines: string[] = [];
  const waiting: ((s: string) => void)[] = [];
  let ended = false;
  rl.on("line", (l) => (waiting.length > 0 ? waiting.shift()!(l) : lines.push(l)));
  rl.on("close", () => {
    ended = true;
    for (const w of waiting.splice(0)) w("");
  });
  return {
    ask: (q) => {
      process.stdout.write(q);
      if (lines.length > 0) return Promise.resolve(lines.shift()!);
      if (ended) return Promise.resolve("");
      return new Promise((done) => waiting.push(done));
    },
    close: () => rl.close(),
  };
}

const list = (s: string) => s.split(",").map((x) => x.trim()).filter((x) => x !== "");
/** An argument vector, split on white space. It is never handed to a shell. */
const words = (s: string) => s.trim().split(/\s+/).filter((x) => x !== "");

export async function init(cwd: string, rootOption: string | undefined, io: Io): Promise<number> {
  const root = resolve(cwd, rootOption ?? ".");
  const file = join(root, COMPONENT_PATH);
  if (existsSync(file)) {
    io.err(`${COMPONENT_PATH} already exists; csh init never overwrites it\n`);
    return 2;
  }
  const own = io.ask === undefined ? stdinAsker() : undefined;
  const ask = io.ask ?? own!.ask;
  try {
    io.out(`csh init writes ${COMPONENT_PATH}. It asks for each field and guesses nothing.\n\n`);
    const name = (await ask("Component name, the same as the system name in the specification: ")).trim();
    const spec = (await ask("The specification module, relative to this directory: ")).trim();
    const implementation = list(await ask("Implementation paths, comma separated (a change there makes a witness stale): "));
    const practices: Practice[] = [];
    for (;;) {
      const id = (await ask(`\nPractice ${practices.length + 1} id, such as ears, bdd or tdd (blank to finish): `)).trim();
      if (id === "") break;
      const p: Practice = {
        id,
        name: (await ask("  Name, such as EARS: ")).trim(),
        kind: (await ask(`  Kind (${PRACTICE_KINDS.join(", ")}): `)).trim() as Practice["kind"],
        sources: list(await ask("  Sources it feeds, by their s.source names, comma separated: ")),
      };
      const adapter = (await ask("  Adapter, a package or a path (blank for the built-in one for the source kind): ")).trim();
      if (adapter !== "") p.adapter = adapter;
      const run = words(await ask("  Harness command that runs it and records witnesses, as words (blank for none): "));
      if (run.length > 0) {
        p.harness = { run, witnesses: (await ask("  Witness file the command writes: ")).trim() };
        const executions = (await ask("  Executions file its reporter writes (blank for reports/executions.ndjson): ")).trim();
        if (executions !== "") p.harness.executions = executions;
      }
      const cites = (await ask("  Source its citations refer to (blank for none): ")).trim();
      if (cites !== "") p.cites = cites;
      const author = (await ask("  Author, a role (blank to leave out): ")).trim();
      if (author !== "") p.author = author;
      const unit = (await ask("  What one artefact is, such as the test (blank to leave out): ")).trim();
      if (unit !== "") p.unit = unit;
      practices.push(p);
    }
    const manifest: ComponentManifest = { schema: COMPONENT_SCHEMA, name, spec, implementation, practices };
    const problems = validateManifest(manifest);
    if (problems.length > 0) {
      io.err(`\nNothing written; the answers do not make a manifest:\n${problems.map((x) => `  ${x.code}: ${x.detail}`).join("\n")}\n`);
      return 1;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, stableJson(manifest));
    io.out(`\nWrote ${COMPONENT_PATH}. csh run checks it against the specification before it evaluates anything.\n`);
    return 0;
  } finally {
    own?.close();
  }
}
