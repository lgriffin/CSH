// ESI.ts's layering, stated as rules over its source files (Ingesting a codebase, stage 23). Each rule says in CSL what
// a charter requirement says in prose, and cites it; the code facts are read from the pinned commit by facts-ts. Every
// rule is candidate: the maintainer of ESI.ts, not this profile, decides whether a rule says what the charter means.
import { system, forbid, only, modules, pkg } from "csl";

export default system("EsiTs", (s) => {
  const Charter = s.source("Charter", { kind: "Requirements", at: "guides/CHARTER.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "ESI.ts maintainer", value: "Imports in src point inward, and side modules share nothing with the pipeline", assurance: "Structural" }, (i) => {
    // ARCH-03 is verified by code review alone; this is the rule its Verified by names as a candidate.
    i.architecture(
      "PipelineTakesResilienceAsParameters",
      forbid(
        modules("src/core/requestPipeline/**", { except: "src/core/requestPipeline/dependencies.ts" }),
        modules(["src/core/cache/ETagCacheManager.ts", "src/core/rateLimiter/RateLimiter.ts", "src/core/circuitBreaker/CircuitBreaker.ts"]),
      ),
      { cites: [{ source: Charter, id: "ARCH-03" }] },
    );
    i.architecture(
      "SdeImportsOnlyPortsAndPeers",
      only(modules("src/sde/**"), [modules("src/core/ports/**"), modules("node:*"), pkg("zod"), pkg("js-yaml"), pkg("adm-zip"), pkg("better-sqlite3")]),
      { cites: [{ source: Charter, id: "ARCH-10" }] },
    );
    i.architecture("NothingImportsTheSde", forbid(modules("src/**", { except: "src/sde/**" }), modules("src/sde/**")), { cites: [{ source: Charter, id: "ARCH-10" }] });
  });
});
