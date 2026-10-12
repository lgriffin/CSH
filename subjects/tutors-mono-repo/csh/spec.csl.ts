// The layering of tutors-mono-repo, stated as rules over its source files (Ingesting a codebase, stage 23). Every rule
// says in CSL what the repository's own .dependency-cruiser.cjs, README.md or ARCHITECTURE.md say, and cites it. All
// rules are candidates: the maintainers, not this profile, decide whether a rule says what they mean.
import { system, forbid, only, modules, inherits, count, exportsName, declares, field, fileExists, script } from "csl";

export default system("TutorsMonoRepo", (s) => {
  const Readme = s.source("Readme", { kind: "Documents", at: "README.md" });
  const Architecture = s.source("Architecture", { kind: "Documents", at: "ARCHITECTURE.md" });
  const Features = s.source("Features", { kind: "Features", at: "tests/bdd/features" });
  // Declared here so claims can cite them; the manifest narrows each to the files it reads (stage 24).
  const Guides = s.source("Guides", { kind: "Documents", at: "guides" });
  const Specs = s.source("Specs", { kind: "Documents", at: "guides/specifications" });
  const Changelog = s.source("Changelog", { kind: "Documents", at: "CHANGELOG.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  // The layers of .dependency-cruiser.cjs:14-35, lowest first. A layer may import its own layer or any beneath it.
  const foundation = ["packages/jsr/**", "packages/svelte/utils/logger/**", "packages/svelte/utils/metrics/**"];
  const core = ["packages/svelte/runes/**", "packages/svelte/course/**", "packages/svelte/utils/a11y/**", "packages/svelte/utils/i18n/**"];
  const feature = [
    "packages/svelte/themes/**",
    "packages/svelte/community/**",
    "packages/svelte/connect/**",
    "packages/svelte/identity-sveltekit/**",
    "packages/svelte/utils/rbac/**",
    "packages/svelte/utils/privacy/**",
    "packages/svelte/utils/tour/**",
  ];
  const primitives = ["packages/svelte/ui-primitives/**"];
  const navigators = ["packages/svelte/ui-navigators/**"];
  const components = ["packages/svelte/ui-components/**"];
  const apps = ["apps/**"];

  s.intent("Layering", { owner: "tutors-mono-repo maintainer", value: "Imports point down the layers, apps stay apart, and the identity and types packages keep to themselves", assurance: "Structural" }, (i) => {
    // .dependency-cruiser.cjs:43-53 makes one rule per layer; README.md:191-199 and ARCHITECTURE.md:114 state the same order.
    i.architecture("FoundationImportsNoHigherLayer", forbid(modules(foundation), modules([...core, ...feature, ...primitives, ...navigators, ...components, ...apps])), { cites: [{ source: Architecture, id: "ARCHITECTURE.md" }] });
    i.architecture("CoreImportsNoHigherLayer", forbid(modules(core), modules([...feature, ...primitives, ...navigators, ...components, ...apps])), { cites: [{ source: Readme, id: "README.md" }] });
    i.architecture("FeatureImportsNoUiOrApp", forbid(modules(feature), modules([...primitives, ...navigators, ...components, ...apps])), { cites: [{ source: Readme, id: "README.md" }] });
    // README.md:96 and :203: "ui-components -> ui-navigators -> ui-primitives", strictly one way.
    i.architecture("PrimitivesImportNoNavigatorComponentOrApp", forbid(modules(primitives), modules([...navigators, ...components, ...apps])), { cites: [{ source: Readme, id: "README.md" }] });
    i.architecture("NavigatorsImportNoComponentOrApp", forbid(modules(navigators), modules([...components, ...apps])), { cites: [{ source: Readme, id: "README.md" }] });
    i.architecture("ComponentsImportNoApp", forbid(modules(components), modules(apps)), { cites: [{ source: Readme, id: "README.md" }] });
    // .dependency-cruiser.cjs:94-100, ui-primitives-no-data-features.
    i.architecture("PrimitivesTakeDataAsProps", forbid(modules(primitives), modules(["packages/svelte/community/**", "packages/svelte/connect/**", "packages/svelte/utils/rbac/**"])), { cites: [{ source: Readme, id: "README.md" }] });
    // .dependency-cruiser.cjs:79-85, no-app-to-app: apps are deployed separately.
    i.architecture("ReaderImportsNoOtherApp", forbid(modules("apps/reader/**"), modules(["apps/catalogue/**", "apps/live/**", "apps/time/**"])));
    i.architecture("CatalogueImportsNoOtherApp", forbid(modules("apps/catalogue/**"), modules(["apps/reader/**", "apps/live/**", "apps/time/**"])));
    i.architecture("LiveImportsNoOtherApp", forbid(modules("apps/live/**"), modules(["apps/reader/**", "apps/catalogue/**", "apps/time/**"])));
    i.architecture("TimeImportsNoOtherApp", forbid(modules("apps/time/**"), modules(["apps/reader/**", "apps/catalogue/**", "apps/live/**"])));
    // .dependency-cruiser.cjs:58-64 and README.md:201: only the identity adapter imports an auth provider.
    i.architecture(
      "OnlyIdentityAdapterImportsAuthProviders",
      forbid(modules(["apps/**", "packages/**"], { except: "packages/svelte/identity-sveltekit/**" }), modules(["@auth/*", "@auth/**", "better-auth", "better-auth/*"])),
      { cites: [{ source: Readme, id: "README.md" }] },
    );
    // .dependency-cruiser.cjs:65-71: the identity contracts import no framework, database, provider or other package.
    i.architecture("IdentityContractsAreSelfContained", only(modules("packages/jsr/identity/**"), [modules("packages/jsr/identity/**")]), { cites: [{ source: Readme, id: "README.md" }] });
    // .dependency-cruiser.cjs:102-108 and Rule 0130: the shared types package imports nothing outside its own files.
    i.architecture("SharedTypesImportNothingOutside", only(modules("packages/jsr/types/**"), [modules("packages/jsr/types/**")]), { cites: [{ source: Features, id: "0130" }] });
  });

  // What the prose says about the code, one claim per sentence that says it (stage 24). Each is judged by lookup in the
  // facts read at the pinned commit: a claim the code refutes is a fact-conflict, and two claims that cannot both hold
  // are a claim-conflict whatever the code says. Each claim is the profile's reading of one sentence, candidate until
  // the maintainers say the sentence means it.
  s.intent("ProseAboutCode", { owner: "tutors-mono-repo maintainer", value: "What the docs say about the code is what the code is", assurance: "Structural" }, (i) => {
    const In = (source: typeof Readme, id: string) => [{ source, id }];
    // The Node floor: README.md and ARCHITECTURE.md give different ones.
    i.claim("ReadmeNodeFloorIs22", field("package.json", "/engines/node", ">=22.12.0"), { at: "README.md:13", cites: In(Readme, "README.md") });
    i.claim("ReadmePnpmFloorIs8", field("package.json", "/engines/pnpm", ">=8.0.0"), { at: "README.md:109", cites: In(Readme, "README.md") });
    i.claim("ArchitectureNodeFloorIs18", field("package.json", "/engines/node", ">=18.0.0"), { at: "ARCHITECTURE.md:133", cites: In(Architecture, "ARCHITECTURE.md") });
    // Versions: the release strategy says package.json reports 15.2.0; the changelog gives the latest entry per app.
    i.claim("ReleaseStrategyRootIs15", field("package.json", "/version", "15.2.0"), { at: "guides/Release-Strategy.md:23", cites: In(Guides, "guides/Release-Strategy.md") });
    i.claim("ReleaseStrategyRootIs15Again", field("package.json", "/version", "15.2.0"), { at: "guides/Release-Strategy.md:354", cites: In(Guides, "guides/Release-Strategy.md") });
    i.claim("ChangelogReaderIs16x2x2", field("apps/reader/package.json", "/version", "16.2.2"), { at: "CHANGELOG.md:22", cites: In(Changelog, "CHANGELOG.md") });
    i.claim("ChangelogLiveIs16x2x0", field("apps/live/package.json", "/version", "16.2.0"), { at: "CHANGELOG.md:183", cites: In(Changelog, "CHANGELOG.md") });
    i.claim("ChangelogCatalogueIs16x2x0", field("apps/catalogue/package.json", "/version", "16.2.0"), { at: "CHANGELOG.md:217", cites: In(Changelog, "CHANGELOG.md") });
    i.claim("ChangelogTimeIs16x2x0", field("apps/time/package.json", "/version", "16.2.0"), { at: "CHANGELOG.md:237", cites: In(Changelog, "CHANGELOG.md") });
    i.claim("ChangelogSharedModelIs5x3x0", field("packages/jsr/model/package.json", "/version", "5.3.0"), { at: "CHANGELOG.md:307", cites: In(Changelog, "CHANGELOG.md") });
    // How many JSR packages the workspace holds: the README table lists seven, the ARCHITECTURE.md layout five.
    i.claim("ReadmeListsSevenJsrPackages", count("deno.json", "/workspace", 7), { at: "README.md:56", cites: In(Readme, "README.md") });
    i.claim("ArchitectureListsFiveJsrPackages", count("deno.json", "/workspace", 5), { at: "ARCHITECTURE.md:168", cites: In(Architecture, "ARCHITECTURE.md") });
    i.claim("WorkspaceHoldsEightJsrPackages", count("deno.json", "/workspace", 8), { cites: In(Architecture, "ARCHITECTURE.md") });
    // Files the guides name as the place a thing lives.
    i.claim("TestingNamesDependencyCruiserConfig", fileExists(".dependency-cruiser.cjs"), { at: "guides/testing/TESTING.md:53", cites: In(Guides, "guides/testing/TESTING.md") });
    i.claim("TestingNamesKnipConfig", fileExists("knip.json"), { at: "guides/testing/TESTING.md:53", cites: In(Guides, "guides/testing/TESTING.md") });
    i.claim("TestingNamesArchitectureCheck", fileExists("scripts/checks/architecture.ts"), { at: "guides/testing/TESTING.md:54", cites: In(Guides, "guides/testing/TESTING.md") });
    i.claim("TestingNamesManifestParityCheck", fileExists("scripts/checks/manifest-parity.ts"), { at: "guides/testing/TESTING.md:54", cites: In(Guides, "guides/testing/TESTING.md") });
    i.claim("EarsNamesRetiredIdsFile", fileExists("tests/bdd/ears-retired-rule-ids.txt"), { at: "guides/testing/EARS-METHODOLOGY.md:226", cites: In(Guides, "guides/testing/EARS-METHODOLOGY.md") });
    i.claim("EarsNamesAuditConfig", fileExists("tests/bdd/ears-audit.config.json"), { at: "guides/testing/EARS-METHODOLOGY.md:256", cites: In(Guides, "guides/testing/EARS-METHODOLOGY.md") });
    i.claim("MigrationsNamesFetchScript", fileExists("scripts/fetch-migrations.sh"), { at: "guides/MIGRATIONS.md:15", cites: In(Guides, "guides/MIGRATIONS.md") });
    // The convention that a Node-level feature has a steps file of the same name, and a ui feature a Playwright spec instead.
    i.claim("EarsCourseLoadingHasSteps", fileExists("tests/bdd/steps/course/course-loading.steps.ts"), { at: "guides/testing/EARS-METHODOLOGY.md:111", cites: In(Guides, "guides/testing/EARS-METHODOLOGY.md") });
    i.claim("EarsUiReadingHasNoSteps", fileExists("tests/bdd/steps/ui/reading.steps.ts"), { holds: false, at: "guides/testing/EARS-METHODOLOGY.md:141", cites: In(Guides, "guides/testing/EARS-METHODOLOGY.md") });
    i.claim("EarsUiReadingHasPlaywrightSpec", fileExists("apps/reader/tests/e2e/reading.spec.ts"), { at: "guides/testing/EARS-METHODOLOGY.md:141", cites: In(Guides, "guides/testing/EARS-METHODOLOGY.md") });
    // Scripts the guides tell a reader to run.
    i.claim("OverviewNamesTestRunway", script("test:runway"), { at: "guides/testing/TESTING-OVERVIEW.md:58", cites: In(Guides, "guides/testing/TESTING-OVERVIEW.md") });
    i.claim("OverviewNamesArchitectureReport", script("architecture-report"), { at: "guides/testing/TESTING-OVERVIEW.md:69", cites: In(Guides, "guides/testing/TESTING-OVERVIEW.md") });
    // Names the code exports or declares.
    i.claim("SharedTypesHoldsLearnerDisplay", exportsName("packages/jsr/types/src/learner.ts", "LearnerDisplay"), { at: "guides/SHARED-TYPES.md:75", cites: In(Guides, "guides/SHARED-TYPES.md") });
    i.claim("SharedTypesLoUserLivesInCommunity", exportsName("packages/svelte/community/src/types.svelte.ts", "LoUser"), { at: "guides/SHARED-TYPES.md:17", cites: In(Guides, "guides/SHARED-TYPES.md") });
    i.claim("SharedTypesSentimentsLiveInModel", exportsName("packages/jsr/model/src/types/tutors-id-types.ts", "COURSE_SENTIMENT_IDS"), { at: "guides/SHARED-TYPES.md:20", cites: In(Guides, "guides/SHARED-TYPES.md") });
    // error-handling.md:5 says a missing course throws a plain Error; the course package declares a typed not-found error.
    i.claim("ErrorSpecSaysNoTypedNotFound", declares("packages/svelte/course/src/course/services/course.svelte.ts", "CourseNotFoundError"), { holds: false, at: "guides/specifications/error-handling.md:5", cites: In(Specs, "guides/specifications/error-handling.md") });
    i.claim("ErrorSpecNotFoundIsAnError", inherits("CourseNotFoundError", "Error"), { at: "guides/specifications/error-handling.md:5", cites: In(Specs, "guides/specifications/error-handling.md") });
  });
});
