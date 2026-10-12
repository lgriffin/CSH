// The Java receiver of the Assertion Ladder paper, taskboard, read as a subject (The Assertion Ladder, stage 51). Its
// AGENTS.md states which package each kind of code belongs in and what each may depend on ("Where things go",
// java/AGENTS.md:15-27); each rule below states one row of that table. Its REQUIREMENTS.md states R-ERR-1
// (java/REQUIREMENTS.md:19), and its AGENTS.md says a new exception is a nested class of the sealed DomainException, after
// which "the compiler then demands its HTTP status in ApiExceptionHandler" (java/AGENTS.md:62-63): the claim below says
// so of ApiExceptionHandler's switch. Every rule and claim is candidate: the receivers' authors, not this profile,
// decide whether it says what the documents mean. No text of the subject is copied here.
import { system, forbid, modules, total } from "csl";

const PKG = "java/src/main/java/com/example/taskboard";
const DOMAIN = `${PKG}/domain/**`;
const REPOSITORY = `${PKG}/repository/**`;
const SERVICE = `${PKG}/service/**`;
const EVENTS = `${PKG}/events/**`;
const API = `${PKG}/api/**`;
const CONFIG = `${PKG}/config/**`;
const ROOT = `${PKG}/TaskboardApplication.java`;

export default system("TaskboardJava", (s) => {
  const Instructions = s.source("Instructions", { kind: "Documents", at: "java" });
  const Requirements = s.source("Requirements", { kind: "Documents", at: "java/REQUIREMENTS.md" });
  const Agents = [{ source: Instructions, id: "java/AGENTS.md" }];

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "taskboard maintainers", value: "Each package depends only on the packages its row of AGENTS.md names", assurance: "Structural" }, (i) => {
    i.architecture("DomainDependsOnNoOtherPackage", forbid(modules(DOMAIN), modules([REPOSITORY, SERVICE, EVENTS, API, CONFIG, ROOT])), { cites: Agents });
    i.architecture("RepositoryDependsOnlyOnTheDomain", forbid(modules(REPOSITORY), modules([SERVICE, EVENTS, API, CONFIG, ROOT])), { cites: Agents });
    i.architecture("ServiceDependsOnNoApiOrEvents", forbid(modules(SERVICE), modules([EVENTS, API, ROOT])), { cites: Agents });
    i.architecture("EventsDependOnlyOnTheDomain", forbid(modules(EVENTS), modules([REPOSITORY, SERVICE, API, CONFIG, ROOT])), { cites: Agents });
    i.architecture("ApiDependsOnlyOnDomainAndService", forbid(modules(API), modules([REPOSITORY, EVENTS, CONFIG, ROOT])), { cites: Agents });
    i.architecture("ConfigDependsOnNoPackage", forbid(modules(CONFIG), modules([DOMAIN, REPOSITORY, SERVICE, EVENTS, API, ROOT])), { cites: Agents });
    // java/AGENTS.md:23: the domain depends on the JDK only. Spring is the one framework the receiver uses (java/pom.xml).
    i.architecture("DomainUsesOnlyTheJdk", forbid(modules(DOMAIN), modules(["org.springframework*"])), { cites: Agents });
  });

  s.intent("Prevented", { owner: "taskboard maintainers", value: "An exception with no HTTP status does not compile", assurance: "Structural" }, (i) => {
    i.claim("ErrorStatusIsTotal", total(`${PKG}/api/ApiExceptionHandler.java`, "ApiExceptionHandler", "DomainException"), { at: "java/AGENTS.md:62", cites: [{ source: Requirements, id: "R-ERR-1" }] });
  });
});
