// F141: rules over Java packages named with dots: a package covers its members, and a glob finer than the package
// the facts record is unknown (From the Java and Python runs, sections 2 and 3).
import { system, forbid, only, modules } from "csl";

const UI = "src/main/java/com/acme/ledger/ui/**";
const CORE = "src/main/java/com/acme/ledger/core/**";

export default system("Ledger", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "The user interface holds no storage", assurance: "Structural" }, (i) => {
    i.architecture("UiUsesNoJdbc", forbid(modules(UI), modules("java.sql.*")), { cites: [{ source: Rules, id: "ARCH-1" }] });
    i.architecture("UiUsesNoJdbcAtAnyDepth", forbid(modules(UI), modules("java.sql.**")), { cites: [{ source: Rules, id: "ARCH-1" }] });
    i.architecture("UiOpensNoConnection", forbid(modules(UI), modules("java.sql.Connection")), { cites: [{ source: Rules, id: "ARCH-2" }] });
    i.architecture("UiUsesNoSwing", forbid(modules(UI), modules("javax.swing.*")), { cites: [{ source: Rules, id: "ARCH-3" }] });
    i.architecture("CoreUsesOnlyLists", only(modules(CORE), [modules("java.util.List")]), { cites: [{ source: Rules, id: "ARCH-4" }] });
  });
});
