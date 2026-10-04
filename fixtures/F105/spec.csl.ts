// F105: architecture rules over the store's containers (Next layers, section 4.1).
import { system, forbid, pkg, container } from "csl";

export default system("Store", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "inputs/rules.md" });
  s.source("C4", { kind: "Architecture", at: "inputs/containers.mmd" });
  s.source("Code", { kind: "Facts", at: "inputs/facts.ndjson" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "Dependencies point inward", assurance: "Structural" }, (i) => {
    i.architecture("CoreIgnoresWeb", forbid(pkg("core"), container("web")), { cites: [{ source: Rules, id: "ARCH-001" }] });
  });
});
