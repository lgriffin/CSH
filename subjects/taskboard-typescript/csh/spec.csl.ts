// The TypeScript receiver of the Assertion Ladder paper, taskboard, read as a subject (The Assertion Ladder, stage 50).
// Its AGENTS.md states where each kind of code belongs and what each layer may import ("Where things go",
// typescript/AGENTS.md:19-29); each rule below states one row of that table. Its REQUIREMENTS.md states R-ERR-1
// (typescript/REQUIREMENTS.md:19), and its AGENTS.md says a new error needs a member of `ErrorCode`, after which "the
// compiler then demands its HTTP status" (typescript/AGENTS.md:60): the claim below says so of STATUS_BY_CODE. Every
// rule and claim is candidate: the receivers' authors, not this profile, decide whether it says what the documents
// mean. No text of the subject is copied here.
import { system, forbid, modules, total } from "csl";

const SRC = "typescript/src";
const DOMAIN = `${SRC}/domain/**`;
const REPOSITORIES = `${SRC}/repositories/**`;
const SERVICES = `${SRC}/services/**`;
const EVENTS = `${SRC}/events/**`;
const API = `${SRC}/api/**`;
const CONFIG = `${SRC}/config.ts`;
const WIRING = [`${SRC}/app.ts`, `${SRC}/main.ts`];

export default system("TaskboardTypescript", (s) => {
  const Instructions = s.source("Instructions", { kind: "Documents", at: "typescript" });
  const Requirements = s.source("Requirements", { kind: "Documents", at: "typescript/REQUIREMENTS.md" });
  const Agents = [{ source: Instructions, id: "typescript/AGENTS.md" }];

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "taskboard maintainers", value: "Each layer imports only the layers its row of AGENTS.md names", assurance: "Structural" }, (i) => {
    i.architecture("DomainImportsNoOtherLayer", forbid(modules(DOMAIN), modules([REPOSITORIES, SERVICES, EVENTS, API, CONFIG, ...WIRING])), { cites: Agents });
    i.architecture("RepositoriesImportOnlyTheDomain", forbid(modules(REPOSITORIES), modules([SERVICES, EVENTS, API, CONFIG, ...WIRING])), { cites: Agents });
    i.architecture("ServicesImportNoApiOrConfig", forbid(modules(SERVICES), modules([API, CONFIG, ...WIRING])), { cites: Agents });
    i.architecture("EventsImportOnlyTheDomain", forbid(modules(EVENTS), modules([REPOSITORIES, SERVICES, API, CONFIG, ...WIRING])), { cites: Agents });
    i.architecture("ApiImportsOnlyDomainAndServices", forbid(modules(API), modules([REPOSITORIES, EVENTS, CONFIG, ...WIRING])), { cites: Agents });
    i.architecture("ConfigImportsNoLayer", forbid(modules(CONFIG), modules([DOMAIN, REPOSITORIES, SERVICES, EVENTS, API, ...WIRING])), { cites: Agents });
    // typescript/AGENTS.md:23 says the domain may import nothing; the receiver's own rule allows node: built-ins only.
    // The packages named are the two the receiver depends on (typescript/package.json).
    i.architecture("DomainUsesNoFramework", forbid(modules(DOMAIN), modules(["fastify", "zod"])), { cites: Agents });
  });

  s.intent("Prevented", { owner: "taskboard maintainers", value: "An error with no HTTP status does not compile", assurance: "Structural" }, (i) => {
    i.claim("ErrorStatusIsTotal", total(`${SRC}/api/error-handler.ts`, "STATUS_BY_CODE", "ErrorCode"), { at: "typescript/AGENTS.md:60", cites: [{ source: Requirements, id: "R-ERR-1" }] });
  });
});
