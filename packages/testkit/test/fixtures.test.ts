// Every golden fixture, one test each (Implementer's brief, section 7).
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createZ3Solver } from "@csh/solver";
import { BUILT_THROUGH_STAGE, FixtureRunner, fixtureStage, listFixtures } from "../src/index.ts";

const repo = resolve(import.meta.dirname, "../../..");
const fixturesDir = join(repo, "fixtures");
let runner: FixtureRunner;

beforeAll(async () => {
  runner = new FixtureRunner({ fixturesDir, solver: await createZ3Solver(), workDir: join(repo, ".csh-cache", "testkit-vitest") });
});

const all = listFixtures(fixturesDir);
// Fixtures written before the code of their stage (Anchor, harnesses and A3, section 14.1) are listed as skipped.
const pending = all.filter((id) => fixtureStage(fixturesDir, id) > BUILT_THROUGH_STAGE);
const built = all.filter((id) => !pending.includes(id));

describe("golden fixtures", () => {
  for (const id of pending) it.skip(`${id} (pending: stage ${fixtureStage(fixturesDir, id)} is not built yet)`, () => undefined);
  it.each(built)("%s", async (id) => {
    const r = await runner.run(id);
    // Fixtures that need gpg, or the npm registry (F96), are skipped only where explicitly allowed; CI runs them all.
    if (r.skipped !== undefined && (process.env.CSH_ALLOW_GPG_SKIP === "1" || process.env.CSH_ALLOW_OFFLINE_SKIP === "1")) return;
    expect(r.skipped, r.skipped).toBeUndefined();
    expect(r.failures, r.failures.join("\n")).toEqual([]);
  });
});
