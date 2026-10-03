// Test-only adapter that reads the clock while its module loads.
const loadedAt = Date.now();
export const adapter = {
  manifest: { id: "test.clock", version: "0", ir: "csh-ir/v1", produces: ["witnesses"], inputKinds: ["Witnesses"] },
  run: () => ({ diagnostics: [{ code: "loaded", severity: "info", message: String(loadedAt) }] }),
};
