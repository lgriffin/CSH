// Test-only adapter that never returns.
export const adapter = {
  manifest: { id: "test.hang", version: "0", ir: "csh-ir/v1", produces: ["witnesses"], inputKinds: ["Witnesses"] },
  run(): never {
    for (;;) {
      // Spin until the harness kills the process.
    }
  },
};
