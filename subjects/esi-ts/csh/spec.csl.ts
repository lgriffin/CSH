// ESI.ts's layering, stated as rules over its source files (Ingesting a codebase, stage 23). Each rule says in CSL what
// a charter requirement says in prose, and cites it; the code facts are read from the pinned commit by facts-ts. Every
// rule is candidate: the maintainer of ESI.ts, not this profile, decides whether a rule says what the charter means.
import { system, forbid, only, modules, pkg, inherits, count, exportsName, field, same, constant, fileExists, atom } from "csl";

export default system("EsiTs", (s) => {
  const Charter = s.source("Charter", { kind: "Requirements", at: "guides/CHARTER.md" });
  // Declared here so claims can cite them; the manifest narrows each to the files it reads (stage 24).
  const Guides = s.source("Guides", { kind: "Documents", at: "guides" });
  const Beads = s.source("Beads", { kind: "Issues", at: ".beads/issues.jsonl" });

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

  // What the prose says about the code, one claim per sentence that says it (stage 24). Each is judged by lookup in the
  // facts read at the pinned commit: a claim the code refutes is a fact-conflict, and two claims that cannot both hold
  // are a claim-conflict whatever the code says. Each claim is the profile's reading of one sentence, candidate until
  // the maintainer says the sentence means it.
  s.intent("ProseAboutCode", { owner: "ESI.ts maintainer", value: "What the guides say about the code is what the code is", assurance: "Structural" }, (i) => {
    const Doc = (path: string) => [{ source: Guides, id: path }];
    // Row 1 of the plan: whether CircuitOpenError is an EsiError.
    i.claim("CharterCircuitOpenIsNoEsiError", inherits("CircuitOpenError", "EsiError"), { holds: false, at: "guides/CHARTER.md:190", cites: [{ source: Charter, id: "guides/CHARTER.md" }] });
    i.claim("ArchitectureCircuitOpenIsNoEsiError", inherits("CircuitOpenError", "EsiError"), { holds: false, at: "guides/ARCHITECTURE.md:941", cites: Doc("guides/ARCHITECTURE.md") });
    i.claim("ErrorsCircuitOpenIsAnEsiError", inherits("CircuitOpenError", "EsiError"), { at: "guides/ERRORS.md:74", cites: Doc("guides/ERRORS.md") });
    // Row 3: how many entry points the package publishes, less its own manifest.
    i.claim("SixEntryPoints", count("package.json", "/exports", 6, { except: ["./package.json"] }), { at: "guides/CHARTER.md:235", cites: [{ source: Charter, id: "ARCH-05" }] });
    i.claim("SevenEntryPoints", count("package.json", "/exports", 7, { except: ["./package.json"] }), { at: "guides/CHARTER.md:244", cites: [{ source: Charter, id: "ARCH-06" }] });
    // Row 4: ARCH-07's reason names an export as missing that the errors subpath has.
    i.claim("ErrorsSubpathLacksIsCircuitOpen", exportsName("src/errors.ts", "isCircuitOpen"), { holds: false, at: "guides/CHARTER.md:251", cites: [{ source: Charter, id: "ARCH-07" }] });
    // Row 7: counts the charter writes by hand. The metrics file holds the unit suites; nothing read holds the jobs.
    i.claim("UnitTierHas192Files", field("etc/doc-metrics.json", "/unitSuites", "192"), { at: "guides/CHARTER.md:356", cites: [{ source: Charter, id: "guides/CHARTER.md" }] });
    i.claim("GateNeeds23Jobs", atom("ci-success needs 23 jobs"), { at: "guides/CHARTER.md:498", cites: [{ source: Charter, id: "GATE-01" }] });
    // Row 8: one compatibility date, written twice in code.
    i.claim("OneCompatibilityDate", same(constant("src/core/constants.ts", "COMPATIBILITY_DATE"), constant("scripts/spec/check-spec-drift.ts", "DEFAULT_COMPATIBILITY_DATE")), { cites: Doc("guides/ARCHITECTURE.md") });
    // Row 11: the security guide says CODEOWNERS is in place; an open issue still asks for it.
    i.claim("CodeownersInPlace", fileExists(".github/CODEOWNERS"), { at: "guides/SECURITY.md:132", cites: Doc("guides/SECURITY.md") });
    i.claim("CodeownersStillToAdd", fileExists(".github/CODEOWNERS"), { holds: false, at: ".beads/issues.jsonl:40", cites: [{ source: Beads, id: "esi-wze" }] });
  });
});
