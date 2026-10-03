// Test-only adapter that throws.
export const adapter = {
  manifest: { id: "test.crash", version: "0", ir: "csh-ir/v1", produces: ["witnesses"], inputKinds: ["Witnesses"] },
  run(): never {
    throw new Error("adapter crashed on purpose");
  },
};
