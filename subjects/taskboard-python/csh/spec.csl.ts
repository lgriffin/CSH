// The Python receiver of the Assertion Ladder paper, taskboard, read as a subject (The Assertion Ladder, stage 50). Its
// AGENTS.md states where each kind of code belongs and what each layer may import ("Where things go",
// python/AGENTS.md:15-25); each rule below states one row of that table. Its REQUIREMENTS.md states R-ERR-1
// (python/REQUIREMENTS.md:19), and its AGENTS.md says only that a new error needs an entry in STATUS_BY_ERROR
// (python/AGENTS.md:60): a told rule, which no compiler enforces. The claim below asks the same question of Python as
// the other receivers' profiles ask of theirs, and is unknown. Every rule and claim is candidate: the receivers'
// authors, not this profile, decide whether it says what the documents mean. No text of the subject is copied here.
import { system, forbid, modules, total } from "csl";

const PKG = "python/src/taskboard";
const DOMAIN = `${PKG}/domain/**`;
const REPOSITORIES = `${PKG}/repositories/**`;
const SERVICES = `${PKG}/services/**`;
const EVENTS = `${PKG}/events/**`;
const API = `${PKG}/api/**`;
const CONFIG = `${PKG}/config.py`;
const WIRING = `${PKG}/app.py`;

export default system("TaskboardPython", (s) => {
  const Instructions = s.source("Instructions", { kind: "Documents", at: "python" });
  const Requirements = s.source("Requirements", { kind: "Documents", at: "python/REQUIREMENTS.md" });
  const Agents = [{ source: Instructions, id: "python/AGENTS.md" }];

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "taskboard maintainers", value: "Each layer imports only the layers its row of AGENTS.md names", assurance: "Structural" }, (i) => {
    i.architecture("DomainImportsNoOtherLayer", forbid(modules(DOMAIN), modules([REPOSITORIES, SERVICES, EVENTS, API, CONFIG, WIRING])), { cites: Agents });
    i.architecture("RepositoriesImportOnlyTheDomain", forbid(modules(REPOSITORIES), modules([SERVICES, EVENTS, API, CONFIG, WIRING])), { cites: Agents });
    i.architecture("ServicesImportNoApiOrConfig", forbid(modules(SERVICES), modules([API, CONFIG, WIRING])), { cites: Agents });
    i.architecture("EventsImportOnlyTheDomain", forbid(modules(EVENTS), modules([REPOSITORIES, SERVICES, API, CONFIG, WIRING])), { cites: Agents });
    i.architecture("ApiImportsOnlyDomainAndServices", forbid(modules(API), modules([REPOSITORIES, EVENTS, CONFIG, WIRING])), { cites: Agents });
    i.architecture("ConfigImportsNoLayer", forbid(modules(CONFIG), modules([DOMAIN, REPOSITORIES, SERVICES, EVENTS, API, WIRING])), { cites: Agents });
    // python/AGENTS.md:19: the domain may import nothing. The frameworks named are those the receiver depends on
    // (python/pyproject.toml), as Python names them.
    i.architecture("DomainUsesNoFramework", forbid(modules(DOMAIN), modules(["fastapi", "starlette", "pydantic", "pydantic_settings", "uvicorn"])), { cites: Agents });
  });

  s.intent("Prevented", { owner: "taskboard maintainers", value: "An error with no HTTP status does not build", assurance: "Structural" }, (i) => {
    i.claim("ErrorStatusIsTotal", total(`${PKG}/api/error_handlers.py`, "STATUS_BY_ERROR", "DomainError"), { at: "python/AGENTS.md:60", cites: [{ source: Requirements, id: "R-ERR-1" }] });
  });
});
