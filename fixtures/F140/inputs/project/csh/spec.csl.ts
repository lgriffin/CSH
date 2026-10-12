// F140: Java types nested in a class are declared by their dotted names; a local class is not, and a nested public
// type is not exported (From the Java and Python runs, section 1).
import { system, declares, exportsName } from "csl";

const RUNNER = "src/main/java/com/acme/jobs/Runner.java";

export default system("Jobs", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Types", { owner: "Architect", value: "What the rules say the runner declares, it declares", assurance: "Structural" }, (i) => {
    i.claim("DeclaresCallback", declares(RUNNER, "Runner.Callback"), { cites: [{ source: Rules, id: "TYPE-1" }] });
    i.claim("DeclaresCallbackKind", declares(RUNNER, "Runner.Callback.Kind"), { cites: [{ source: Rules, id: "TYPE-1" }] });
    i.claim("DeclaresLimits", declares(RUNNER, "Runner.Limits"), { cites: [{ source: Rules, id: "TYPE-2" }] });
    i.claim("DeclaresLimit", declares(RUNNER, "Runner.Limits.LIMIT"), { cites: [{ source: Rules, id: "TYPE-2" }] });
    i.claim("DeclaresAttempt", declares(RUNNER, "Attempt"), { cites: [{ source: Rules, id: "TYPE-3" }] });
    i.claim("DeclaresRunnerAttempt", declares(RUNNER, "Runner.Attempt"), { cites: [{ source: Rules, id: "TYPE-3" }] });
  });

  s.intent("Api", { owner: "Architect", value: "Only top-level types are exported", assurance: "Structural" }, (i) => {
    i.claim("ExportsRunner", exportsName(RUNNER, "Runner"), { cites: [{ source: Rules, id: "API-1" }] });
    i.claim("CallbackIsNotExported", exportsName(RUNNER, "Runner.Callback"), { holds: false, cites: [{ source: Rules, id: "API-1" }] });
  });
});
