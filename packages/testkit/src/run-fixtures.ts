// Run golden fixtures and print a summary: node packages/testkit/src/run-fixtures.ts [F10 F11 ...]
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createZ3Solver } from "@csh/solver";
import { FixtureRunner, listFixtures, summarise } from "./runner.ts";

const repo = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const fixturesDir = join(repo, "fixtures");
const solver = await createZ3Solver();
const runner = new FixtureRunner({ fixturesDir, solver, workDir: join(repo, ".csh-cache", "testkit") });
const ids = process.argv.slice(2).length > 0 ? process.argv.slice(2) : listFixtures(fixturesDir);
const results = [];
for (const id of ids) {
  const r = await runner.run(id);
  results.push(r);
  process.stdout.write(`${r.pass ? "pass" : r.skipped !== undefined ? "skip" : "FAIL"} ${id}\n`);
}
process.stdout.write(`\n${summarise(results)}`);
process.exit(results.every((r) => r.pass || r.skipped !== undefined) ? 0 : 1);
