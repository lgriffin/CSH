// F175: what the board's stores are, over Java interfaces (Analyse, danger and grain, section 5).
import { system, inherits } from "csl";

export default system("Board", (s) => {
  const Reqs = s.source("Reqs", { kind: "Requirements", at: "docs/requirements.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Stores", { owner: "Architect", value: "Every store is a card store", assurance: "Structural" }, (i) => {
    i.claim("MemoryIsACardStore", inherits("MemoryCardStore", "CardStore"), { cites: [{ source: Reqs, id: "REQ-1" }] });
    i.claim("JdbcIsACardStore", inherits("JdbcCardStore", "CardStore"), { cites: [{ source: Reqs, id: "REQ-2" }] });
  });
});
