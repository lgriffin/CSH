// F131: rules the runs could not state: through core, values only, cycles between directories, counts of files,
// manifest fields and a mistyped target (From real runs, section 2).
import { system, forbid, modules, acyclic, count, field } from "csl";

export default system("Hub", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Architect", value: "Dependencies point inward", assurance: "Structural" }, (i) => {
    i.architecture("PodsReachNoDatabase", forbid(modules("src/pods/**"), modules("src/db/**"), { reaches: true }), { cites: [{ source: Rules, id: "ARCH-1" }] });
    i.architecture("PodsImportNoDatabase", forbid(modules("src/pods/**"), modules("src/db/**")), { cites: [{ source: Rules, id: "ARCH-1" }] });
    i.architecture("FrontendImportsOnlyTypesFromCore", forbid(modules("src/frontend/**", { values: true }), modules("src/core/**")), { cites: [{ source: Rules, id: "ARCH-2" }] });
    i.architecture("PanelImportsOnlyTypesFromCore", forbid(modules("src/frontend/panel.ts", { values: true }), modules("src/core/**")), { cites: [{ source: Rules, id: "ARCH-2" }] });
    i.architecture("NoCycleBetweenDirectories", acyclic(modules("src/**"), { group: "src/*" }), { cites: [{ source: Rules, id: "ARCH-3" }] });
    i.architecture("NoCycleInTheDatabase", acyclic(modules("src/db/**")), { cites: [{ source: Rules, id: "ARCH-3" }] });
    i.architecture("CoreIgnoresPackages", forbid(modules("src/core/**"), modules("src/pakages/**")), { cites: [{ source: Rules, id: "ARCH-4" }] });
  });

  s.intent("Prose", { owner: "Architect", value: "What the documents say of the code is true", assurance: "Structural" }, (i) => {
    i.claim("TenUseCases", count(modules("src/usecases/*.ts"), 10), { at: "docs/rules.md:9", cites: [{ source: Rules, id: "DOC-1" }] });
    i.claim("ThreeUseCases", count(modules("src/usecases/*.ts"), 3), { cites: [{ source: Rules, id: "DOC-1" }] });
    i.claim("NotFourUseCases", count(modules("src/usecases/*.ts"), 4), { holds: false, cites: [{ source: Rules, id: "DOC-1" }] });
    i.claim("PinnedToPnpm9", field("package.json", "/packageManager", "pnpm@9.0.0"), { at: "docs/rules.md:10", cites: [{ source: Rules, id: "DOC-2" }] });
    i.claim("TwoWorkspaceGlobs", count("package.json", "/workspaces", 2), { cites: [{ source: Rules, id: "DOC-3" }] });
    i.claim("VitestPinned", field("package.json", "/devDependencies/vitest", "3.2.7"), { cites: [{ source: Rules, id: "DOC-3" }] });
  });
});
