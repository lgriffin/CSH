// The csl command: emit, print and lock (Language reference, sections 7 and 8; Joint evaluation, section 7).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { makeRefiner } from "@csh/check";
import { emit, type Lock, runSandboxed } from "@csh/emit";
import { compareCodePoints, type Module, stableJson } from "@csh/kernel";
import { printModule } from "@csh/print";
import { createZ3Solver } from "@csh/solver";
import { parseArgs } from "./args.ts";
import { LOCK_PATH, loadProject } from "./project.ts";

const USAGE = `csl: the specification language

  csl emit <spec.csl.ts> [--out model.json]   Emit the model and its digest. Non-zero on any rule or error.
  csl print <model.json | spec.csl.ts>        Print the canonical TypeScript.
  csl lock <spec.csl.ts>                      Write csh/lock.json from the packs the specification uses.

Options: --root <dir>.
`;

interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  cwd: string;
}

export async function csl(argv: string[], io: Io): Promise<number> {
  const a = parseArgs(argv);
  if (a.errors.length > 0) {
    io.err(`${a.errors.join("\n")}\n`);
    return 2;
  }
  const cmd = a.positional.shift();
  const file = a.positional[0];
  if (cmd === undefined || file === undefined || a.flags.has("help")) {
    io.out(USAGE);
    return cmd === undefined ? 2 : 0;
  }
  const p = loadProject(io.cwd, a.options.root);
  const abs = resolve(io.cwd, file);
  switch (cmd) {
    case "emit": {
      const solver = await createZ3Solver();
      const r = await emit(abs, { root: p.root, refine: makeRefiner(solver), ...(p.lock !== undefined ? { lock: p.lock } : {}) });
      if (!r.ok) {
        io.err(`${r.errors.map((e) => `${e.code}${e.path !== undefined ? ` ${e.path}` : ""}${e.line !== undefined ? `:${e.line}` : ""}: ${e.message}`).join("\n")}\n`);
        return 1;
      }
      if (a.options.out !== undefined) {
        mkdirSync(dirname(resolve(io.cwd, a.options.out)), { recursive: true });
        writeFileSync(resolve(io.cwd, a.options.out), `${r.canonical}\n`);
      }
      io.out(`${r.digest}\n`);
      return 0;
    }
    case "print": {
      let m: Module;
      if (abs.endsWith(".json")) m = JSON.parse(readFileSync(abs, "utf8")) as Module;
      else {
        const r = await emit(abs, { root: p.root, skipTypeCheck: true, ...(p.lock !== undefined ? { lock: p.lock } : {}) });
        if (!r.ok) {
          io.err(`${r.errors.map((e) => `${e.code}: ${e.message}`).join("\n")}\n`);
          return 1;
        }
        m = r.module;
      }
      io.out(printModule(m));
      return 0;
    }
    case "lock": {
      const r = await runSandboxed(abs, { root: p.root });
      if (!r.ok || r.module === undefined) {
        io.err(`${r.code ?? "E-EVAL"}: ${r.message ?? "emission failed"}\n`);
        return 1;
      }
      const lock: Lock = { schema: "csh-lock/v1", packs: {} };
      for (const u of [...r.module.uses].sort((x, y) => compareCodePoints(x.pack, y.pack))) lock.packs[u.pack] = { version: u.version, digest: u.digest };
      const out = join(p.root, LOCK_PATH);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, stableJson(lock));
      io.out(`${existsSync(out) ? "wrote" : "could not write"} ${LOCK_PATH}: ${Object.keys(lock.packs).length} pack(s)\n`);
      return 0;
    }
    default:
      io.err(`unknown command ${cmd}\n${USAGE}`);
      return 2;
  }
}
