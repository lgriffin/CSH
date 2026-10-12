// F140: rungs on told rules. Two rules are approved by the fixture's stand-in, one is a candidate (The Assertion
// Ladder, section 3).
import { system, forbid, modules } from "csl";

export default system("Ladder", (s) => {
  const Reqs = s.source("Reqs", { kind: "Documents", at: "docs/requirements.md" });
  const Ears = s.source("Ears", { kind: "Requirements", at: "docs/ears.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "Dependencies point inward", assurance: "Structural" }, (i) => {
    i.architecture("DomainImportsNoApi", forbid(modules("src/domain/**"), modules("src/api/**")), { cites: [{ source: Reqs, id: "R-A-4" }, { source: Ears, id: "EARS-1" }] });
    i.architecture("ApiImportsNoTests", forbid(modules("src/api/**"), modules("tests/**")), { cites: [{ source: Reqs, id: "R-A-5" }] });
    i.architecture("DomainImportsNoTests", forbid(modules("src/domain/**"), modules("tests/**")), { cites: [{ source: Reqs, id: "R-A-6" }] });
  });
});
