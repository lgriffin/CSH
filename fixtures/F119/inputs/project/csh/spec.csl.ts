// F119: a Java codebase's layering and exception classes, stated over its source files (Polyglot code, section 3).
import { system, forbid, only, modules, inherits } from "csl";

export default system("Shop", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "Dependencies point inward", assurance: "Structural" }, (i) => {
    i.architecture("DomainIgnoresAdapters", forbid(modules("src/main/java/com/acme/shop/domain/**"), modules("src/main/java/com/acme/shop/adapters/**")), { cites: [{ source: Rules, id: "ARCH-1" }] });
    i.architecture("PortsIgnoreAdapters", forbid(modules("src/main/java/com/acme/shop/ports/**"), modules("src/main/java/com/acme/shop/adapters/**")), { cites: [{ source: Rules, id: "ARCH-2" }] });
    i.architecture("PortsSeeOnlyTheDomain", only(modules("src/main/java/com/acme/shop/ports/**"), [modules("src/main/java/com/acme/shop/domain/**")]), { cites: [{ source: Rules, id: "ARCH-2" }] });
  });

  s.intent("Errors", { owner: "Architect", value: "What the rules say each class is, it is", assurance: "Structural" }, (i) => {
    i.claim("OrderNotFoundIsAnException", inherits("OrderNotFoundException", "Exception"), { cites: [{ source: Rules, id: "ERR-1" }] });
    i.claim("JdbcRepositoryIsADaoSupport", inherits("JdbcOrderRepository", "DaoSupport"), { cites: [{ source: Rules, id: "ERR-2" }] });
  });
});
