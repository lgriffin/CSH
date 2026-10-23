import { defineConfig } from "vitest/config";
import floors from "./coverage-floors.json" with { type: "json" };

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: "forks",
    // Many fixtures run git and gpg synchronously, so on Windows, where each process is slow to start, a worker can stay
    // busy past the runner's 60 s reply limit when every core has one (stage 54); two is what the Windows CI job uses.
    ...(process.platform === "win32" ? { maxWorkers: 2 } : {}),
    // pnpm test:coverage (stage 65): every package's sources, held to the floors in coverage-floors.json, for the
    // workspace and per package. A floor only rises: when a change lifts a package, raise its floor with it.
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        // Run only as a child process, which v8 coverage of the test workers does not see: the emission sandbox, the
        // adapter sandbox and the bin scripts' process wrapper (each tested by spawning it), and two CI scripts.
        "packages/emit/src/runner.ts",
        "packages/run/src/adapter-runner.ts",
        "packages/cli/src/exit.ts",
        "packages/testkit/src/pack.ts",
        "packages/testkit/src/run-fixtures.ts",
      ],
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      reportOnFailure: true,
      thresholds: floors,
    },
  },
});
