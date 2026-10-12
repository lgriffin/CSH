// The Tutors release harness's structure and what its docs say about its code, stated as CSL over facts read from the
// pinned commit by facts-ts (Ingesting a codebase, stages 23 and 24). Every rule and claim cites the document that states
// it; each is the profile's reading of one sentence, candidate until the maintainers say the sentence means it.
import { system, forbid, only, modules, field, exportsName, fileExists, script, count } from "csl";

export default system("TutorsReleaseHarness", (s) => {
  const Docs = s.source("Docs", { kind: "Documents", at: "." });

  s.policy("Structural", { require: ["FactsCurrent"] });

  const Doc = (path: string) => [{ source: Docs, id: path }];

  s.intent("Layering", { owner: "Harness maintainer", value: "The comparison is a pure function of the captures, and the leaf modules stay leaves", assurance: "Structural" }, (i) => {
    // docs/architecture/06-decisions.md:44, "Mann-Whitney is hand-written and dependency-free".
    i.architecture("MannWhitneyIsDependencyFree", only(modules("src/compare/stats.ts"), []), { cites: Doc("docs/architecture/06-decisions.md") });
    // docs/architecture/README.md:134, "src/clock-probe.ts is pure"; it takes the capture type and nothing else.
    i.architecture("ClockProbeIsPure", only(modules("src/clock-probe.ts"), [modules("src/types.ts")]), { cites: Doc("docs/architecture/README.md") });
    // docs/noise-burndown.md:144 and docs/user-guide/05-noise-and-self-test.md:38, "everything after capture is a pure
    // function of the two captures on disk": the compare engines and the gate reach no collector, no docker and no stack.
    i.architecture(
      "CompareAndGateStayPure",
      forbid(modules(["src/compare/**", "src/gate.ts"]), modules(["src/collectors/**", "src/stack.ts", "src/images.ts", "src/substrate/**", "node:child_process"])),
      { cites: Doc("docs/noise-burndown.md") },
    );
    // The same sentence, for the normalising masks and the claims matcher, which also run after capture.
    i.architecture(
      "NormaliseAndClaimsStayPure",
      forbid(modules(["src/normalise/**", "src/claims/**"]), modules(["src/collectors/**", "src/stack.ts", "src/images.ts", "src/substrate/**", "node:child_process"])),
      { cites: Doc("docs/user-guide/09-extending.md") },
    );
    // docs/architecture/02-containers.md:63, the CLI is one container launched by bin/harness.mjs: no module imports it.
    i.architecture("NothingImportsTheCli", forbid(modules("src/**", { except: "src/cli.ts" }), modules("src/cli.ts")), { cites: Doc("docs/architecture/02-containers.md") });
  });

  s.intent("DocsAboutCode", { owner: "Harness maintainer", value: "What the docs say about the code is what the code is", assurance: "Structural" }, (i) => {
    // Versions: three documents give the harness and contract versions.
    i.claim("ContractMdIsAt135", field("docs/contract/cli.json", "/contractVersion", "1.35.0"), { at: "docs/contract.md:3", cites: Doc("docs/contract.md") });
    i.claim("PackageIsAt135", field("package.json", "/version", "1.35.0"), { at: "docs/contract.md:36", cites: Doc("docs/contract.md") });
    i.claim("ArchitectureDrawnAtHarness141", field("package.json", "/version", "1.4.1"), { at: "docs/architecture/03-components-pipeline.md:9", cites: Doc("docs/architecture/03-components-pipeline.md") });
    i.claim("ArchitectureDrawnAtContract140", field("docs/contract/cli.json", "/contractVersion", "1.4.0"), { at: "docs/architecture/README.md:13", cites: Doc("docs/architecture/README.md") });
    i.claim("NodeFloorIs22", field("package.json", "/engines/node", ">=22"), { at: "docs/architecture/02-containers.md:63", cites: Doc("docs/architecture/02-containers.md") });
    // Names the docs give to code.
    i.claim("ContractVersionIsExported", exportsName("src/version.ts", "CONTRACT_VERSION"), { at: "docs/contract.md:37", cites: Doc("docs/contract.md") });
    i.claim("AppsIsExported", exportsName("src/image-ref.ts", "APPS"), { at: "docs/architecture/02-containers.md:7", cites: Doc("docs/architecture/02-containers.md") });
    i.claim("MutantsScriptExists", script("mutants"), { at: "README.md:83", cites: Doc("README.md") });
    i.claim("HarnessScriptExists", script("harness"), { at: "docs/architecture/02-containers.md:63", cites: Doc("docs/architecture/02-containers.md") });
    // Files the docs say exist, and one they say does not.
    i.claim("BusTransportSeamExists", fileExists("src/bus/transport.ts"), { at: "docs/architecture/README.md:119", cites: Doc("docs/architecture/README.md") });
    i.claim("ClockProbeExists", fileExists("src/clock-probe.ts"), { at: "docs/architecture/README.md:134", cites: Doc("docs/architecture/README.md") });
    i.claim("NoBusStubFixture", fileExists("fixtures/bus/stub.mjs"), { holds: false, at: "docs/architecture/02-containers.md:98", cites: Doc("docs/architecture/02-containers.md") });
    // The mutant count: the docs say sixteen in some places and thirteen in others, and mutants.yaml is YAML, which no
    // fact reads yet, so neither count is decided; the two cannot both hold.
    i.claim("SixteenMutantsInReadme", count("mutants/mutants.yaml", "/mutants", 16), { at: "docs/architecture/README.md:130", cites: Doc("docs/architecture/README.md") });
    i.claim("ThirteenMutantsInDecisions", count("mutants/mutants.yaml", "/mutants", 13), { at: "docs/architecture/06-decisions.md:23", cites: Doc("docs/architecture/06-decisions.md") });
    i.claim("ThirteenMutantsInUserGuide", count("mutants/mutants.yaml", "/mutants", 13), { at: "docs/user-guide/05-noise-and-self-test.md:153", cites: Doc("docs/user-guide/05-noise-and-self-test.md") });
  });
});
