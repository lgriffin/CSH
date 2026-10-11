// Test-only adapter that reaches for the real Date through a date's constructor while its module loads.
const loadedAt = (new Date(0).constructor as DateConstructor).now();
export const adapter = {
  manifest: { id: "test.clock-ctor", version: "0", ir: "csh-ir/v1", produces: ["witnesses"], inputKinds: ["Witnesses"] },
  run: () => ({ diagnostics: [{ code: "loaded", severity: "info", message: String(loadedAt) }] }),
};
