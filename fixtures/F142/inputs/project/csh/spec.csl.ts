// F142: a Python core that imports a Qt submodule, and classes nested in a class and in a function
// (From the Java and Python runs, sections 1 and 2).
import { system, forbid, modules, declares } from "csl";

const UPDATER = "app/core/updater.py";

export default system("Updater", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "The core runs without Qt", assurance: "Structural" }, (i) => {
    i.architecture("CoreUsesNoQt", forbid(modules("app/core/**"), modules("PySide6.*")), { cites: [{ source: Rules, id: "ARCH-1" }] });
    i.architecture("CoreUsesNoWidgets", forbid(modules("app/core/**"), modules("PySide6.QtWidgets")), { cites: [{ source: Rules, id: "ARCH-2" }] });
  });

  s.intent("Types", { owner: "Architect", value: "What the rules say the updater declares, it declares", assurance: "Structural" }, (i) => {
    i.claim("DeclaresSignals", declares(UPDATER, "Updater.Signals"), { cites: [{ source: Rules, id: "CODE-1" }] });
    i.claim("DeclaresProbe", declares(UPDATER, "Probe"), { cites: [{ source: Rules, id: "CODE-2" }] });
    i.claim("DeclaresUpdaterProbe", declares(UPDATER, "Updater.Probe"), { cites: [{ source: Rules, id: "CODE-2" }] });
  });
});
