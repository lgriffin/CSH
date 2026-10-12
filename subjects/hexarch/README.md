# hexarch, a subject profile

This directory evaluates [hexarch](https://github.com/howtocodeit/hexarch) from outside: the companion code of an
article on hexagonal architecture in Rust, one branch per stage of the article. It is the Rust profile of stage 36
([12](../../docs/spec/12-polyglot-code.md), section 5). The profile is pinned to commit
`d58a5c648602f941083ca6ca85c79d718092df03`, the head of the branch `3-simple-service`, which the README calls the
general-purpose template for hexagonal Rust apps. The subject is only read; nothing is written to it
([11](../../docs/spec/11-ingesting-a-codebase.md)).

```
node packages/cli/bin/csh.js subject fetch --root subjects/hexarch   # clone it at the pinned commit
node packages/cli/bin/csh.js run --root subjects/hexarch             # evaluate it
node packages/cli/bin/csh.js expect --root subjects/hexarch          # compare with the expected results
```

hexarch is MIT-licensed. CSH commits from it what it commits from ESI.ts and no more: identifiers, paths, spans and
commits, never its text ([#37](https://github.com/lgriffin/CSH/issues/37)). The checkout and the run reports stay under
this directory's `.csh-cache/` and `reports/`, which git ignores.

The expected results are [`csh/expected.json`](csh/expected.json), written from the README and the code's doc
comments, and from a reading of the source by hand, before CSH was first run on the subject. CI runs the profile in the
job `Subject (hexarch)`.

## What it reads

| Source | Kind | At | Read at `d58a5c6` |
| --- | --- | --- | --- |
| Docs | Documents | `README.md` | 1 document |
| Tests | TestFiles | `src/**/*.rs` | 18 files, 1 test (an inline `#[tokio::test]` module); Rust tests live beside the code, so every file is read and 17 hold none |
| Code | Code | `src/**/*.rs`, `Cargo.toml` | 18 modules, 70 dependencies, 54 declarations, 42 exports and 28 fields of `Cargo.toml`, none skipped. The library's root is configured (`[lib] path`), and its module tree is followed from there |

## The rules and claims

The README says only that this branch is a template for hexagonal apps. The rest is said by the code's own doc
comments: the ports are the domain's contracts, and the domain is not concerned with the technology of external code
(`src/lib/domain/blog/ports.rs`); the service is the canonical implementation of the service port
(`src/lib/domain/blog/service.rs`); the outbound modules are adapters to ports; and the HTTP package is opaque to the
HTTP module's consumers (`src/lib/inbound/http.rs`). The specification, [`csh/spec.csl.ts`](csh/spec.csl.ts), cites the
README, the one document a source reads, and gives each doc comment's line in a comment or as a claim's `at`.

| Rule or claim | Says | Expected | At `d58a5c6` |
| --- | --- | --- | --- |
| `DomainImportsNoAdapter` | The domain imports no inbound or outbound adapter and no binary | satisfied | satisfied |
| `DomainBindsToNoTechnology` | The domain imports no HTTP, database or runtime crate | satisfied | satisfied |
| `HttpPackageIsOpaque` | Nothing outside the inbound adapter imports `axum` | satisfied | satisfied |
| `InboundImportsNoOutbound`, `OutboundImportsNoInbound` | The adapters meet only through the domain's ports | satisfied | satisfied |
| Four `...IsAPort` claims | The four ports the doc comments describe are public | satisfied | satisfied |
| `ServiceIsTheCanonicalImplementation`, `HttpServerIsExported` | The service and the HTTP server the doc comments describe are declared and public | satisfied | satisfied |

What stays unknown, with its reason, is listed in the expected results: uses of a crate by a full path or an attribute
(the binary's `#[tokio::main]`), which trait a type implements, and whether `Service` is a trait, as the README calls it,
or the struct that implements the `BlogService` trait, as the code has it.
