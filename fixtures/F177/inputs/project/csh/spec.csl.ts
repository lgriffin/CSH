// F177: what the board's stores are, over Go embedded structs (Analyse, danger and grain, section 5).
import { system, inherits } from "csl";

export default system("Board", (s) => {
  const Reqs = s.source("Reqs", { kind: "Requirements", at: "docs/requirements.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Stores", { owner: "Architect", value: "Every store is a memory store", assurance: "Structural" }, (i) => {
    i.claim("AuditedIsAMemoryStore", inherits("AuditedStore", "MemoryStore"), { cites: [{ source: Reqs, id: "REQ-1" }] });
    i.claim("CachedIsAMemoryStore", inherits("CachedStore", "MemoryStore"), { cites: [{ source: Reqs, id: "REQ-2" }] });
  });
});
