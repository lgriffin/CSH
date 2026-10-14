// F174: a layering rule over a TypeScript board, whose test reads green (Analyse, danger and grain, section 3).
import { system, forbid, modules } from "csl";

export default system("Board", (s) => {
  const Reqs = s.source("Reqs", { kind: "Requirements", at: "docs/requirements.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "The domain stands alone", assurance: "Structural" }, (i) => {
    i.architecture("DomainIgnoresHttp", forbid(modules("src/domain/**"), modules("src/http/**")), { cites: [{ source: Reqs, id: "REQ-2" }] });
  });
});
