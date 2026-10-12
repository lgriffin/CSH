// F122: layering rules over a codebase that holds files in languages CSH has no reader for (Polyglot code, section 1).
import { system, forbid, modules } from "csl";

export default system("Shop", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "Dependencies point inward", assurance: "Structural" }, (i) => {
    i.architecture("CoreIgnoresWeb", forbid(modules("src/core/**"), modules("src/web/**")), { cites: [{ source: Rules, id: "ARCH-1" }] });
    i.architecture("LegacyIgnoresWeb", forbid(modules("src/legacy/**"), modules("src/web/**")), { cites: [{ source: Rules, id: "ARCH-2" }] });
    i.architecture("WebIgnoresLegacy", forbid(modules("src/web/**"), modules("src/legacy/**")), { cites: [{ source: Rules, id: "ARCH-3" }] });
  });
});
