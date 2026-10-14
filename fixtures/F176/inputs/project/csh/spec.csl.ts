// F176: a layering rule over a Python board, whose test reads green (Analyse, danger and grain, section 3).
import { system, forbid, modules } from "csl";

export default system("Board", (s) => {
  const Reqs = s.source("Reqs", { kind: "Requirements", at: "docs/requirements.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "The domain stands alone", assurance: "Structural" }, (i) => {
    i.architecture("DomainIgnoresHttp", forbid(modules("src/board/domain/**"), modules("src/board/http/**")), { cites: [{ source: Reqs, id: "REQ-2" }] });
  });
});
