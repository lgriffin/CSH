// go-clean-arch's layering, stated as rules over its Go source files (stage 36). Its README lists Uncle Bob's rules
// under "Description" (README.md:35-41), names four layers, models, repository, usecase and delivery (README.md:45-50),
// and its changelog for v4 (README.md:17-23) declares interfaces on the consuming side and introduces the `internal`
// package and a service-focused package. The README names the layers but not their directories; this profile reads
// models as `domain`, usecase as the service package `article`, repository as `internal/repository` and delivery as
// `internal/rest`, which is the profile's reading and candidate like every rule. No text of the subject is copied here.
import { system, forbid, only, modules, fileExists, declares } from "csl";

export default system("GoCleanArch", (s) => {
  const Docs = s.source("Docs", { kind: "Documents", at: "." });
  const Readme = [{ source: Docs, id: "README.md" }];

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "go-clean-arch maintainer", value: "Business rules know nothing of the outside world, and delivery and repository meet only through the service", assurance: "Structural" }, (i) => {
    // README.md:41: the business rules know nothing at all about the outside world. The models import only Go's
    // standard library (named go:<path>).
    i.architecture("ModelsKnowNothingOutside", only(modules("domain/**"), [modules("go:**")]), { cites: Readme });
    // README.md:37-41: the usecase is independent of the UI, the database and any external agency, so the service
    // package imports no delivery, repository or composition package of the project...
    i.architecture("UsecaseImportsNoOuterLayer", forbid(modules("article/**"), modules(["internal/**", "app/**"])), { cites: Readme });
    // ...and no web framework or database driver (README.md:37 and :40). External packages are named by import path.
    i.architecture("UsecaseImportsNoFrameworkOrDatabase", forbid(modules("article/**"), modules(["go:database/**", "github.com/go-sql-driver/**", "github.com/labstack/echo/**", "gopkg.in/go-playground/validator.v9"])), { cites: Readme });
    // README.md:45-50 and the diagram it shows: delivery reaches the repository only through the usecase.
    i.architecture("DeliveryImportsNoRepository", forbid(modules("internal/rest/**"), modules("internal/repository/**")), { cites: Readme });
    i.architecture("RepositoryImportsNoDelivery", forbid(modules("internal/repository/**"), modules("internal/rest/**")), { cites: Readme });
  });

  // What the README says about the code, one claim per line that says it.
  s.intent("ProseAboutCode", { owner: "go-clean-arch maintainer", value: "What the README says about the code is what the code is", assurance: "Structural" }, (i) => {
    // README.md:21: interfaces are declared on the consuming side. The service consumes the repositories, delivery
    // consumes the service, and the models, which consume neither, declare no repository interface.
    i.claim("ServiceDeclaresTheRepositoryInterface", declares("article/service.go", "ArticleRepository"), { at: "README.md:21", cites: Readme });
    i.claim("DeliveryDeclaresTheServiceInterface", declares("internal/rest/article.go", "ArticleService"), { at: "README.md:21", cites: Readme });
    i.claim("ModelsDeclareNoRepositoryInterface", declares("domain/article.go", "ArticleRepository"), { holds: false, at: "README.md:21", cites: Readme });
    // README.md:61 and :86: the files the instructions name.
    i.claim("SchemaFileExists", fileExists("article.sql"), { at: "README.md:61", cites: Readme });
    i.claim("ExampleEnvExists", fileExists("example.env"), { at: "README.md:86", cites: Readme });
  });
});
