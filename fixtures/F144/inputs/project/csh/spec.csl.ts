// F144: prevention where the language cannot give it: Python checks no mapping when compiled, and Go has no closed
// types (The Assertion Ladder, section 4).
import { system, total } from "csl";

export default system("Mixed", (s) => {
  const Reqs = s.source("Reqs", { kind: "Documents", at: "docs/requirements.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Prevented", { owner: "Architect", value: "An unmapped code does not build", assurance: "Structural" }, (i) => {
    i.claim("PythonStatusIsTotal", total("app/errors.py", "STATUS", "Code"), { cites: [{ source: Reqs, id: "R-Y-1" }] });
    i.claim("GoStatusIsTotal", total("api/status.go", "Status", "Code"), { cites: [{ source: Reqs, id: "R-G-1" }] });
  });
});
