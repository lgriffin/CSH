// F152: prevention in Java. Each claim says a type maps every member of a closed type in a switch javac checks for
// completeness (The Assertion Ladder, section 4).
import { system, total } from "csl";

const DIR = "src/main/java/com/example/shop";

export default system("Shop", (s) => {
  const Reqs = s.source("Reqs", { kind: "Documents", at: "docs/requirements.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Prevented", { owner: "Architect", value: "An unmapped case does not compile", assurance: "Structural" }, (i) => {
    i.claim("HandlerIsTotal", total(`${DIR}/Handler.java`, "Handler", "ShopException"), { cites: [{ source: Reqs, id: "R-J-1" }] });
    i.claim("AreasIsTotal", total(`${DIR}/Areas.java`, "Areas", "Shape"));
    i.claim("LabelsIsTotal", total(`${DIR}/Labels.java`, "Labels", "Status"));
    i.claim("FallbackIsTotal", total(`${DIR}/Fallback.java`, "Fallback", "Status"));
    i.claim("LegacyIsTotal", total(`${DIR}/Legacy.java`, "Legacy", "Status"));
  });
});
