// F141: prevention in TypeScript. Each claim says a constant maps every member of a closed type in a form tsc checks
// (The Assertion Ladder, section 4).
import { system, total } from "csl";

export default system("Maps", (s) => {
  const Reqs = s.source("Reqs", { kind: "Documents", at: "docs/requirements.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Prevented", { owner: "Architect", value: "An unmapped error code does not compile", assurance: "Structural" }, (i) => {
    i.claim("StatusIsTotal", total("src/maps.ts", "STATUS", "Code"), { cites: [{ source: Reqs, id: "R-P-1" }] });
    i.claim("LabelsIsTotal", total("src/maps.ts", "LABELS", "Level"));
    i.claim("TitlesIsTotal", total("src/maps.ts", "TITLES", "Code"));
    i.claim("SomeIsTotal", total("src/maps.ts", "SOME", "Code"), { cites: [{ source: Reqs, id: "R-P-2" }] });
    i.claim("AnyIsTotal", total("src/maps.ts", "ANY", "Code"));
    i.claim("LooseIsTotal", total("src/maps.ts", "LOOSE", "Loose"));
    i.claim("OtherIsTotal", total("src/other.ts", "X", "Code"));
  });
});
