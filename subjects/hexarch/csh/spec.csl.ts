// hexarch's hexagon, stated as rules over its Rust source files (stage 36). The pinned commit is the head of the
// branch 3-simple-service, which the README (README.md:11) calls a general-purpose template for hexagonal Rust apps.
// The README says no more about the layout; the code's own doc comments say the rest: the ports are the domain's
// contracts and the domain is not concerned with the technology of any external code (src/lib/domain/blog/ports.rs:18-21
// and :34-37), the domain's service is the canonical implementation of its service port
// (src/lib/domain/blog/service.rs:10), the outbound modules are adapters to ports (src/lib/outbound/email_client.rs:4,
// src/lib/outbound/prometheus.rs:3), and the HTTP package is opaque to the consumers of the HTTP module
// (src/lib/inbound/http.rs:31). Rules cite the README, the one document a source reads, and name in a comment the line
// they read; claims give that line as `at`. Every rule and claim is candidate. No text of the subject is copied here.
import { system, forbid, modules, pkg, exportsName, declares } from "csl";

const DOMAIN = ["src/lib/domain.rs", "src/lib/domain/**"];
const INBOUND = ["src/lib/inbound.rs", "src/lib/inbound/**"];
const OUTBOUND = ["src/lib/outbound.rs", "src/lib/outbound/**"];

export default system("Hexarch", (s) => {
  const Docs = s.source("Docs", { kind: "Documents", at: "README.md" });
  const Readme = [{ source: Docs, id: "README.md" }];

  s.policy("Structural", { require: ["FactsCurrent"] });

  s.intent("Layering", { owner: "hexarch maintainer", value: "The domain is the hexagon: adapters depend on its ports, and it depends on no adapter or technology", assurance: "Structural" }, (i) => {
    // README.md:11 and ports.rs:20-21: the domain depends on no adapter, inbound or outbound, and on no binary.
    i.architecture("DomainImportsNoAdapter", forbid(modules(DOMAIN), modules([...INBOUND, ...OUTBOUND, "src/bin/**"])), { cites: Readme });
    // ports.rs:20-21: the domain is not concerned with the underlying technology. The crates named are the HTTP
    // framework and its middleware, the database toolkit and the async runtime of Cargo.toml's dependencies, by the
    // names Rust code uses for them.
    i.architecture("DomainBindsToNoTechnology", forbid(modules(DOMAIN), modules(["axum", "sqlx", "tokio", "tower_http", "tower_layer"])), { cites: Readme });
    // http.rs:31: the HTTP package is opaque to the HTTP module's consumers, so nothing outside the inbound adapter
    // imports it.
    i.architecture("HttpPackageIsOpaque", forbid(modules("src/**", { except: INBOUND }), pkg("axum")), { cites: Readme });
    // README.md:11, hexagonal: an inbound adapter and an outbound adapter meet only through the domain's ports.
    i.architecture("InboundImportsNoOutbound", forbid(modules(INBOUND), modules(OUTBOUND)), { cites: Readme });
    i.architecture("OutboundImportsNoInbound", forbid(modules(OUTBOUND), modules(INBOUND)), { cites: Readme });
  });

  // What the doc comments say about the code, one claim per comment that says it. A doc comment is no item a source
  // reads, so these claims cite nothing; `at` names the comment. The README does not say these things.
  s.intent("ProseAboutCode", { owner: "hexarch maintainer", value: "What the documentation says about the code is what the code is", assurance: "Structural" }, (i) => {
    const PORTS = "src/lib/domain/blog/ports.rs";
    i.claim("BlogServiceIsAPort", exportsName(PORTS, "BlogService"), { at: `${PORTS}:18` });
    i.claim("BlogRepositoryIsAPort", exportsName(PORTS, "BlogRepository"), { at: `${PORTS}:34` });
    i.claim("BlogMetricsIsAPort", exportsName(PORTS, "BlogMetrics"), { at: `${PORTS}:51` });
    i.claim("AuthorNotifierIsAPort", exportsName(PORTS, "AuthorNotifier"), { at: `${PORTS}:61` });
    i.claim("ServiceIsTheCanonicalImplementation", declares("src/lib/domain/blog/service.rs", "Service"), { at: "src/lib/domain/blog/service.rs:10" });
    i.claim("HttpServerIsExported", exportsName("src/lib/inbound/http.rs", "HttpServer"), { at: "src/lib/inbound/http.rs:31" });
  });
});
