// Test-only adapter that returns no output.
export const adapter = {
  manifest: { id: "test.nothing", version: "0", ir: "csh-ir/v1", produces: ["witnesses"], inputKinds: ["Witnesses"] },
  run(): undefined {
    return undefined;
  },
};
