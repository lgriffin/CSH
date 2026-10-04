// F104: architecture rules over the store's containers (Next layers, section 4.1).
import { system, closed } from "csl";

export default system("Store", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "inputs/rules.md" });
  const C4 = s.source("C4", { kind: "Architecture", at: "inputs/containers.mmd" });
  s.source("Code", { kind: "Facts", at: "inputs/facts.ndjson" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "Dependencies point inward", assurance: "Structural" }, (i) => {
    i.architecture("DiagramIsComplete", closed(C4), { cites: [{ source: Rules, id: "ARCH-003" }] });
  });
});
