# F160

A cold analysis, with no profile ([16](../../docs/spec/16-analyse-danger-grain.md), section 2; stage 55). The subject is
a small Go service: a root module and a nested one (`tools/go.mod`), requirements with identifiers in
`docs/requirements.md`, layering sentences in its README, one EARS sentence with no identifier in `docs/guide.md`, a
Mermaid container diagram, and one test.

- The proposal names the nested manifest, the diagram as an `Architecture` source, and the identifier family `STK`.
- The three layering sentences of the README's list are told rules, each an item of `Documents` at its line, and so is
  the EARS sentence of the guide. "Nothing here depends on luck" says no layering (no negation of a dependency),
  "Imports are sorted with goimports" neither, and the sentence inside the code fence is not prose.
- Nothing checks the lifted rules, so each is a gap `unverified` at L2; `STK-1` is cited by the test, at L3; `STK-2` is
  cited by nothing.
- The README names `internal/domain/stock.go`, which does not exist.
- The report's sections come in the order the spec gives, and nothing is written into the subject.

The expected result was written from the specification before the command existed.
