// The Workspace component (Next layers, section 4.4): the repository's own package structure, read from three places
// that have never been read together. The container diagram, the dependency rules written in the implementer's brief,
// and the imports and manifests of the code. Every rule here is candidate until the owner approves it; DiagramIsComplete
// is approved, if at all, only after the first run shows what is undrawn (A-73).
import { system, forbid, only, closed, pkg, container, anything } from "csl";

export default system("Workspace", (s) => {
  const Brief = s.source("Brief", { kind: "Requirements", at: "docs/architecture/rules.md" });
  const C4 = s.source("C4", { kind: "Architecture", at: "docs/architecture/containers.mmd" });
  s.source("Code", { kind: "Facts", at: "reports/facts.ndjson" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "Workspace owner", value: "Dependencies point inward, and the container diagram shows each of them", assurance: "Structural" }, (i) => {
    i.architecture("KernelDependsOnNothing", forbid(pkg("kernel"), anything), { cites: [{ source: Brief, id: "ARCH-001" }] });
    i.architecture("AdaptersSeeKernelAndWitnessOnly", only(container("adapters"), [pkg("kernel"), pkg("witness")]), { cites: [{ source: Brief, id: "ARCH-002" }] });
    i.architecture("DiagramIsComplete", closed(C4), { cites: [{ source: Brief, id: "ARCH-003" }] });
  });
});
