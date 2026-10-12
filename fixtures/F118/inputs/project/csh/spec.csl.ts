// F118: a Python codebase's layering and error classes, stated over its source files (Polyglot code, section 3).
import { system, forbid, only, modules, inherits } from "csl";

export default system("Shop", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "Dependencies point inward", assurance: "Structural" }, (i) => {
    i.architecture("DomainIgnoresAdapters", forbid(modules("src/shop/domain/**"), modules("src/shop/adapters/**")), { cites: [{ source: Rules, id: "ARCH-1" }] });
    i.architecture("PortsIgnoreAdapters", forbid(modules("src/shop/ports/**"), modules("src/shop/adapters/**")), { cites: [{ source: Rules, id: "ARCH-2" }] });
    i.architecture("PortsSeeOnlyTheDomain", only(modules("src/shop/ports/**"), [modules("src/shop/domain/**"), modules("python:*")]), { cites: [{ source: Rules, id: "ARCH-2" }] });
  });

  s.intent("Errors", { owner: "Architect", value: "What the rules say each class is, it is", assurance: "Structural" }, (i) => {
    i.claim("OrderNotFoundIsAnException", inherits("OrderNotFound", "Exception"), { cites: [{ source: Rules, id: "ERR-1" }] });
    i.claim("OrderRecordIsABaseModel", inherits("OrderRecord", "BaseModel"), { cites: [{ source: Rules, id: "ERR-2" }] });
  });
});
