// A test-only adapter that parses each file it is given as Python, to show the grammars load inside the sandbox.
import type { Adapter } from "@csh/witness";
import { parseWith } from "@csh/facts-code";

export const adapter: Adapter = {
  manifest: { id: "test.parse", version: "0", ir: "csh-ir/v1", produces: [], inputKinds: ["Code"] },
  run: async (input) => {
    const diagnostics = [];
    for (const f of input.files) {
      const message = await parseWith("python", new TextDecoder().decode(f.bytes), (root) => `${root.type} ${root.namedChildCount}`);
      diagnostics.push({ code: "tree", severity: "info" as const, message, span: f.path });
    }
    return { diagnostics };
  },
};
