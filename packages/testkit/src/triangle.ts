// The two new sides of the triangle (Anchor, harnesses and A3, section 11.1). Docs and examples: every command block
// of the root README is executed. Examples and C4: every container is exercised by at least one example, and an example
// declares only the containers its commands reach.
//
//   node packages/testkit/src/triangle.ts readme     run every sh block of README.md, in order, from the repository root
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

/** The fenced blocks marked sh, in document order. A block marked otherwise (a reference listing) is not a command. */
export function commandBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^```sh\n([\s\S]*?)^```$/gm)].map((m) => m[1]!.trimEnd());
}

/** Containers of the container diagram, by id, apart from the development-only ones. */
export function runtimeContainers(repo = REPO): string[] {
  const source = readFileSync(join(repo, "docs", "architecture", "containers.mmd"), "utf8");
  return [...source.matchAll(/^\s*Container\((\w+),\s*"([^"]*)"/gm)].filter((m) => !/development only/i.test(m[2]!)).map((m) => m[1]!);
}

/** The containers an example's README declares, as a list of `id` items under "## Containers it exercises". */
export function declaredContainers(readme: string): string[] | undefined {
  const section = /^## Containers it exercises\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(readme);
  if (section === null) return undefined;
  return [...section[1]!.matchAll(/^- `(\w+)`/gm)].map((m) => m[1]!);
}

/** What shows that an example reaches a container: a command it runs, or, for the harness, a probe in its tests. */
const REACHES: Record<string, { commands?: RegExp; files?: RegExp }> = {
  cli: { commands: /\bcs[lh] [a-z]/ },
  kernel: { commands: /\bcs[lh] [a-z]/ },
  emission: { commands: /\bcsl emit\b|\bcsh (run|check|gate|gaps)\b/ },
  adapters: { commands: /\bcsh (run|check|gate|gaps)\b/ },
  check: { commands: /\bcsh (run|check|gaps|explain)\b/ },
  gate: { commands: /\bcsh (run|gate)\b/ },
  run: { commands: /\bcsh run\b/ },
  component: { commands: /\bcsh (run|init)\b/ },
  ledger: { commands: /\bcsh (approve|reject|retire|waive|countersign)\b/ },
  a3: { commands: /\bcsh a3\b/ },
  harness: { files: /from "@csh\/harness"/ },
};

const files = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).flatMap((e) => (statSync(join(dir, e)).isDirectory() ? files(join(dir, e)) : [join(dir, e)])) : [];

/** The commands an example runs: its walkthrough script and the command blocks of its README. */
export function exampleCommands(dir: string): string {
  const script = join(dir, "walkthrough.sh");
  return [existsSync(script) ? readFileSync(script, "utf8") : "", ...commandBlocks(readFileSync(join(dir, "README.md"), "utf8"))].join("\n");
}

/** Whether an example's commands and files reach a container; undefined for a container with no rule here. */
export function reaches(dir: string, container: string): boolean | undefined {
  const rule = REACHES[container];
  if (rule === undefined) return undefined;
  const commands = exampleCommands(dir);
  if (rule.commands !== undefined && !rule.commands.test(commands)) return false;
  if (rule.files !== undefined && !files(join(dir, "test")).some((f) => rule.files!.test(readFileSync(f, "utf8")))) return false;
  return true;
}

/** Run every command block of the root README in order, each in a fresh bash from the repository root. */
function runReadme(): number {
  const blocks = commandBlocks(readFileSync(join(REPO, "README.md"), "utf8"));
  for (const [i, block] of blocks.entries()) {
    process.stdout.write(`\n== README block ${i + 1} of ${blocks.length}\n${block.replace(/^/gm, "$ ")}\n`);
    const r = spawnSync("bash", ["-euo", "pipefail", "-c", block], { cwd: REPO, stdio: "inherit" });
    if (r.status !== 0) {
      process.stderr.write(`README block ${i + 1} failed with exit ${r.status}\n`);
      return 1;
    }
  }
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== "readme") {
    process.stderr.write("usage: node packages/testkit/src/triangle.ts readme\n");
    process.exit(2);
  }
  process.exit(runReadme());
}
