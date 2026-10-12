// fastapi-clean-example's layering, stated as rules over its Python source files (stage 36). Its README states the
// layers and the Dependency Rule under "Architecture Principles", and pyproject.toml states the same order as an
// import-linter "layers" contract (id clean-architecture, at pyproject.toml:94): run, setup, presentation,
// infrastructure, application, domain, each importing only the layers after it. Each rule below cites the README and
// names, in a comment, the heading and lines it reads. Every rule and claim is candidate: the subject's maintainer, not
// this profile, decides whether it says what the documents mean. No text of the subject is copied here.
import { system, forbid, modules, fileExists, declares, inherits } from "csl";

const DOMAIN = "src/app/domain/**";
const APPLICATION = "src/app/application/**";
const INFRASTRUCTURE = "src/app/infrastructure/**";
const PRESENTATION = "src/app/presentation/**";
const SETUP = "src/app/setup/**";
const RUN = "src/app/run.py";
const ALEMBIC_ENV = "src/app/infrastructure/persistence_sqla/alembic/env.py";

export default system("FastapiCleanExample", (s) => {
  const Docs = s.source("Docs", { kind: "Documents", at: "README.md" });
  const Readme = [{ source: Docs, id: "README.md" }];

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "fastapi-clean-example maintainer", value: "Dependencies never point outwards within the core, and the layers import in the order the contract states", assurance: "Structural" }, (i) => {
    // README "Dependency Rule" (README.md:135-147) and "Note on Adapters" (README.md:179-205): the core is domain and
    // application, and nothing in it depends on a more concrete layer. pyproject.toml:94-106 orders the layers.
    i.architecture("DomainImportsNoOuterLayer", forbid(modules(DOMAIN), modules([APPLICATION, INFRASTRUCTURE, PRESENTATION, SETUP, RUN])), { cites: Readme });
    i.architecture("ApplicationImportsNoOuterLayer", forbid(modules(APPLICATION), modules([INFRASTRUCTURE, PRESENTATION, SETUP, RUN])), { cites: Readme });
    // The contract alone puts infrastructure below presentation and setup (pyproject.toml:94-106); the README's revised
    // rule (README.md:205) constrains only the core. Its one ignored import, from the Alembic environment to the
    // settings module (pyproject.toml:107-109), is a rule of its own.
    i.architecture("InfrastructureImportsNoOuterLayer", forbid(modules(INFRASTRUCTURE, { except: ALEMBIC_ENV }), modules([PRESENTATION, SETUP, RUN])), { cites: Readme });
    i.architecture("AlembicEnvImportsOnlyTheSettings", forbid(modules(ALEMBIC_ENV), modules([PRESENTATION, SETUP, RUN], { except: "src/app/setup/config/settings.py" })), { cites: Readme });
    i.architecture("PresentationImportsNoComposition", forbid(modules(PRESENTATION), modules([SETUP, RUN])), { cites: Readme });
    // README "Dependency Rule" (README.md:150-154) and "External Layer" (README.md:254-256): the core may use libraries
    // that extend the language, never frameworks or clients of out-of-process systems. The packages named are the web
    // framework, its toolkit, the ORM and its migrations, the database driver, the server and the DI container the
    // README's Technology Stack lists (README.md:490-496). External packages are named as Python names them.
    i.architecture(
      "CoreImportsNoFrameworkOrDriver",
      forbid(modules([DOMAIN, APPLICATION]), modules(["fastapi", "fastapi_error_map", "starlette", "sqlalchemy", "alembic", "alembic_postgresql_enum", "psycopg", "uvicorn", "uvloop", "dishka"])),
      { cites: Readme },
    );
    // README "Application Layer" (README.md:109): interactors do not call each other. A call needs an import here, so
    // no interactor or query service imports another; a call through an injected object is not seen by this rule.
    i.architecture("InteractorsDoNotCallEachOther", forbid(modules(["src/app/application/commands/**", "src/app/application/queries/**"]), modules(["src/app/application/commands/**", "src/app/application/queries/**"])), { cites: Readme });
  });

  // What the README says about the code, one claim per sentence or tree line that says it.
  s.intent("ProseAboutCode", { owner: "fastapi-clean-example maintainer", value: "What the README says about the code is what the code is", assurance: "Structural" }, (i) => {
    // README.md:168: the username-taken exception is a domain exception that infrastructure may raise.
    i.claim("UsernameTakenIsDeclaredInTheDomain", declares("src/app/domain/exceptions/user.py", "UsernameAlreadyExistsError"), { at: "README.md:168", cites: Readme });
    i.claim("UsernameTakenIsAnException", inherits("UsernameAlreadyExistsError", "Exception"), { at: "README.md:168", cites: Readme });
    // README "Structure" (README.md:439-488): the files the tree names, each with its role.
    i.claim("EntityBaseExists", fileExists("src/app/domain/entities/base.py"), { at: "README.md:453", cites: Readme });
    i.claim("ValueObjectBaseExists", fileExists("src/app/domain/value_objects/base.py"), { at: "README.md:456", cites: Readme });
    i.claim("CreateUserInteractorExists", fileExists("src/app/application/commands/create_user.py"), { at: "README.md:462", cites: Readme });
    i.claim("ListUsersQueryServiceExists", fileExists("src/app/application/queries/list_users.py"), { at: "README.md:465", cites: Readme });
    i.claim("AppFactoryExists", fileExists("src/app/setup/app_factory.py"), { at: "README.md:485", cites: Readme });
    i.claim("EntryPointExists", fileExists("src/app/run.py"), { at: "README.md:487", cites: Readme });
  });
});
