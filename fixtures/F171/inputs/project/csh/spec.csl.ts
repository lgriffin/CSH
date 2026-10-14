// F171: container rules over a Go repository's packages (Analyse, danger and grain, section 5).
import { system, forbid, only, container, closed } from "csl";

export default system("Shop", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });
  const C4 = s.source("C4", { kind: "Architecture", at: "docs/containers.mmd" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "Dependencies point inward", assurance: "Structural" }, (i) => {
    i.architecture("CoreIgnoresDb", forbid(container("core"), container("db")), { cites: [{ source: Rules, id: "ARCH-1" }] });
    i.architecture("WebSeesOnlyCore", only(container("web"), [container("core")]), { cites: [{ source: Rules, id: "ARCH-2" }] });
    i.architecture("DiagramIsComplete", closed(C4), { cites: [{ source: Rules, id: "ARCH-3" }] });
  });
});
