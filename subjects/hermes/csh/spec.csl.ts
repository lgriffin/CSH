// Hermes's package layering as rules over its source files. Candidate: the maintainer decides what the docs mean.
import { system, forbid, only, modules, pkg } from "csl";

export default system("Hermes", (s) => {
  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Hermes maintainer", value: "core is a leaf, and the services share only core", assurance: "Structural" }, (i) => {
    i.architecture("CoreImportsNoService", forbid(modules("packages/core/src/**"), modules(["packages/gateway/src/**", "packages/session-pod/src/**", "packages/token-service/src/**", "packages/frontend/src/**"])));
    i.architecture("GatewayNeverImportsSessionPod", forbid(modules("packages/gateway/src/**"), modules(["packages/session-pod/src/**", "packages/frontend/src/**"])));
    i.architecture("SessionPodNeverImportsGateway", forbid(modules("packages/session-pod/src/**"), modules(["packages/gateway/src/**", "packages/frontend/src/**"])));
    i.architecture("FrontendTakesNoServerPackages", forbid(modules("packages/frontend/src/**"), pkg("pg")));
  });
});
