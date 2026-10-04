// F100: architecture rules over the store's containers (Next layers, section 4.1).
import { system, forbid, only, pkg, container } from "csl";

export default system("Store", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "inputs/rules.md" });
  s.source("C4", { kind: "Architecture", at: "inputs/containers.mmd" });
  s.source("Code", { kind: "Facts", at: "inputs/facts.ndjson" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "Dependencies point inward", assurance: "Structural" }, (i) => {
    i.architecture("CoreIgnoresWeb", forbid(pkg("core"), container("web")), { cites: [{ source: Rules, id: "ARCH-001" }] });
    i.architecture("WebSeesCoreAndDb", only(container("web"), [pkg("core"), pkg("db")]), { cites: [{ source: Rules, id: "ARCH-002" }] });
  });
});
