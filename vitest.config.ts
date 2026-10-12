import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: "forks",
    // Many fixtures run git and gpg synchronously, so on Windows, where each process is slow to start, a worker can stay
    // busy past the runner's 60 s reply limit when every core has one (stage 54); two is what the Windows CI job uses.
    ...(process.platform === "win32" ? { maxWorkers: 2 } : {}),
  },
});
