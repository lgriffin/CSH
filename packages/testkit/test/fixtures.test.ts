// Every golden fixture, one test each (Implementer's brief, section 7).
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createZ3Solver } from "@csh/solver";
import { FixtureRunner, listFixtures } from "../src/index.ts";

const repo = resolve(import.meta.dirname, "../../..");
const fixturesDir = join(repo, "fixtures");
let runner: FixtureRunner;

beforeAll(async () => {
  runner = new FixtureRunner({ fixturesDir, solver: await createZ3Solver(), workDir: join(repo, ".csh-cache", "testkit-vitest") });
});

describe("golden fixtures", () => {
  it.each(listFixtures(fixturesDir))("%s", async (id) => {
    const r = await runner.run(id);
    // Fixtures that need gpg are skipped only where explicitly allowed; CI runs them all.
    if (r.skipped !== undefined && process.env.CSH_ALLOW_GPG_SKIP === "1") return;
    expect(r.skipped, r.skipped).toBeUndefined();
    expect(r.failures, r.failures.join("\n")).toEqual([]);
  });
});
