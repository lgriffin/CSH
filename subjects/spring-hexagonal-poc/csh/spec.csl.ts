// spring-hexagonal-architecture-poc's ports and adapters, stated as rules over its Java source files (stage 36). Its
// Readme states the pattern under "Ports & Adapters Pattern" and the packages under "Project package structure"
// (Readme.md:36-57): `api` holds the primary (driving) adapters, `spi` the secondary (driven) adapters, and `business`
// the core, which has no external dependencies and communicates only through ports. Each rule cites the Readme and
// names, in a comment, the lines it reads. Every rule and claim is candidate: the subject's maintainer, not this
// profile, decides whether it says what the Readme means. No text of the subject is copied here.
import { system, forbid, only, modules, fileExists, field } from "csl";

const APP = "src/main/java/com/rbiedrawa/hexagonal/app";
const BUSINESS = `${APP}/business/**`;
const API = `${APP}/api/**`;
const SPI = `${APP}/spi/**`;

export default system("SpringHexagonalPoc", (s) => {
  const Docs = s.source("Docs", { kind: "Documents", at: "Readme.md" });
  const Readme = [{ source: Docs, id: "Readme.md" }];

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "spring-hexagonal-architecture-poc maintainer", value: "The business core depends on nothing outside it, and adapters reach each other only through the core's ports", assurance: "Structural" }, (i) => {
    // Readme.md:42: the core of the application, reached only through ports. No adapter, no Spring configuration and
    // no entry point is imported from it.
    i.architecture("BusinessImportsNoAdapter", forbid(modules(BUSINESS), modules([API, SPI, `${APP}/config/**`, `${APP}/Application.java`])), { cites: Readme });
    // Readme.md:42: the core has no external dependencies. Read strictly, as a rule over imports: the core imports only
    // itself and the Java platform's own packages (java.*). External packages are named as Java names them.
    i.architecture("BusinessHasNoExternalDependency", only(modules(BUSINESS), [modules("java.*")]), { cites: Readme });
    // Readme.md:22 and :39-48: an adapter converts between a technology and the application's ports, and the
    // application interacts with the adapters on all sides through those ports, so a driving adapter does not import a
    // driven one, nor the reverse.
    i.architecture("PrimaryAdaptersImportNoSecondaryAdapter", forbid(modules(API), modules(SPI)), { cites: Readme });
    i.architecture("SecondaryAdaptersImportNoPrimaryAdapter", forbid(modules(SPI), modules(API)), { cites: Readme });
  });

  // What the Readme says about the repository, one claim per line that says it.
  s.intent("ProseAboutCode", { owner: "spring-hexagonal-architecture-poc maintainer", value: "What the Readme says about the repository is what the repository is", assurance: "Structural" }, (i) => {
    // Readme.md:63: the prerequisite Java version. The build states it in build.gradle, which no reader reads.
    i.claim("JavaElevenIsTheTarget", field("build.gradle", "/sourceCompatibility", "11"), { at: "Readme.md:63", cites: Readme });
    // Readme.md:76: the Compose file the PostgreSQL instructions run.
    i.claim("ComposeFileExists", fileExists("docker/docker-compose.yml"), { at: "Readme.md:76", cites: Readme });
    // Readme.md:101: the licence file the Readme points to.
    i.claim("LicenceFileExists", fileExists("LICENSE"), { at: "Readme.md:101", cites: Readme });
  });
});
