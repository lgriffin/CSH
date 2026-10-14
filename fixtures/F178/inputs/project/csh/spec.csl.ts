// F178: what the board's traits are, over Rust supertraits (Analyse, danger and grain, section 5).
import { system, inherits } from "csl";

export default system("Board", (s) => {
  const Reqs = s.source("Reqs", { kind: "Requirements", at: "docs/requirements.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Stores", { owner: "Architect", value: "Every store writes", assurance: "Structural" }, (i) => {
    i.claim("StoreIsAWriter", inherits("Store", "Writer"), { cites: [{ source: Reqs, id: "REQ-1" }] });
    i.claim("CacheIsAWriter", inherits("Cache", "Writer"), { cites: [{ source: Reqs, id: "REQ-2" }] });
  });
});
