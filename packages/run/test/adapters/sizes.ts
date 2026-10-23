// Test-only adapter that reports the size of each file it was handed, as an item.
import type { AdapterInput } from "@csh/witness";

export const adapter = {
  manifest: { id: "test.sizes", version: "0", ir: "csh-ir/v1", produces: ["items"], inputKinds: ["Sizes"] },
  run(input: AdapterInput) {
    return { items: input.files.map((f) => ({ id: f.path, text: f.path, span: `${f.path}:1`, textDigest: f.digest, attrs: { bytes: String(f.bytes.length) } })), diagnostics: [] };
  },
};
