// F143: prevention in Rust. Each claim says an item maps every variant of an enum in a match rustc checks for
// completeness (The Assertion Ladder, section 4).
import { system, total } from "csl";

const ERROR = "src/error.rs";

export default system("Api", (s) => {
  const Reqs = s.source("Reqs", { kind: "Documents", at: "docs/requirements.md" });

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Prevented", { owner: "Architect", value: "An unmapped variant does not compile", assurance: "Structural" }, (i) => {
    i.claim("StatusIsTotal", total(ERROR, "status", "ApiError"), { cites: [{ source: Reqs, id: "R-R-1" }] });
    i.claim("PartialIsTotal", total(ERROR, "partial", "ApiError"));
    i.claim("NamedIsTotal", total(ERROR, "named", "ApiError"));
    i.claim("MapperIsTotal", total(ERROR, "Mapper", "ApiError"));
    i.claim("OtherIsTotalOverApiError", total(ERROR, "other", "ApiError"));
    i.claim("OtherIsTotalOverLevel", total(ERROR, "other", "Level"));
  });
});
