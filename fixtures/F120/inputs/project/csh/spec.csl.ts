// F120: a Go module's layering and one method of its domain, stated over its source files (Polyglot code, section 3).
import { system, forbid, only, modules, declares } from "csl";

export default system("Shop", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "Dependencies point inward", assurance: "Structural" }, (i) => {
    i.architecture("DomainIgnoresAdapters", forbid(modules("domain/**"), modules("adapters/**")), { cites: [{ source: Rules, id: "ARCH-1" }] });
    i.architecture("PortsIgnoreAdapters", forbid(modules("ports/**"), modules("adapters/**")), { cites: [{ source: Rules, id: "ARCH-2" }] });
    i.architecture("PortsSeeOnlyTheDomain", only(modules("ports/**"), [modules("domain/**")]), { cites: [{ source: Rules, id: "ARCH-2" }] });
  });

  s.intent("Domain", { owner: "Architect", value: "What the rules say the domain has, it has", assurance: "Structural" }, (i) => {
    i.claim("OrderHasTotal", declares("domain/order.go", "Order.Total"), { cites: [{ source: Rules, id: "DOM-1" }] });
  });
});
