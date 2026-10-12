// F121: a Rust crate's layering and one trait of its ports, stated over its source files (Polyglot code, section 3).
import { system, forbid, only, modules, declares } from "csl";

export default system("Shop", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "Dependencies point inward", assurance: "Structural" }, (i) => {
    i.architecture("DomainIgnoresAdapters", forbid(modules("src/domain/**"), modules("src/adapters/**")), { cites: [{ source: Rules, id: "ARCH-1" }] });
    i.architecture("PortsIgnoreAdapters", forbid(modules("src/ports/**"), modules("src/adapters/**")), { cites: [{ source: Rules, id: "ARCH-2" }] });
    i.architecture("PortsSeeOnlyTheDomain", only(modules("src/ports/**"), [modules("src/domain/**")]), { cites: [{ source: Rules, id: "ARCH-2" }] });
  });

  s.intent("Ports", { owner: "Architect", value: "What the rules say the ports declare, they declare", assurance: "Structural" }, (i) => {
    i.claim("PortsDeclareOrderStore", declares("src/ports/mod.rs", "OrderStore"), { cites: [{ source: Rules, id: "PORT-1" }] });
  });
});
