# csl

## Purpose

`csl` is the specification language: an internal TypeScript DSL whose `system(...)` builder runs a callback once with symbolic handles and returns a plain csh-ir/v1 `Module`. Its types let the TypeScript compiler catch rules S1 to S5 (unknown names, unit mismatches, phase misuse, incomplete intents and bad binding targets) while the author types.

## Where it sits

`csl` belongs to the "Emission sandbox" container, together with `@csh/emit` and `@csh/print`, shown in the [containers diagram](../../docs/architecture/containers.mmd). Its place in emission is in [components-emission.mmd](../../docs/architecture/components-emission.mmd). Specification modules import it, and they are evaluated inside the sandbox.

## Public interface

- `system(name, build)`: builds a `Module`; the callback runs exactly once with symbolic handles.
- `SystemBuilder`: `enum`, `state`, `event` (with an optional `deterministic: true`, so that two examples answering one input two ways are a conflict rather than a divergence), `transition`, `policy`, `intent`, `source`, `claims`, `bind`, `use` and `relax`.
- `ClaimBuilder`: `assume`, `invariant`, `requirement`, `example`, `architecture` and the reserved `temporal`.
- `forbid(from, to)`, `only(from, to[])`, `closed(source)`, `pkg(name)`, `container(id)`, `anything`: the architecture builders; `s.architecture(name, forbid(pkg("kernel"), anything))` writes a rule the check engine evaluates ([architecture rules guide](../../docs/guides/architecture-rules.md)).
- `unit(dimension, symbol)`, `UnitFn`: a branded unit and its literal constructor.
- `int(unit?)`, `bool()`, `lit(value)`, `IntType`, `BoolType`, `EnumType`: type descriptors and a unitless literal.
- `and`, `or`, `not`, `truth`: boolean combinators and the boolean literal.
- `Int`, `Bool`, `EnumValue`, `Phase`: handle types that carry unit and phase for the compiler.
- `StateRef`, `EventRef`, `EventCall`, `StepHandles`, `SourceRef`: references returned by the builder.
- `definePack(module, version)`, `Pack`: declares a pack with a name, an exact version and the digest of its model.
- `isModule`, `MODULE_BRAND`: recognises a module built by `system(...)`.
- `compositionOf`, `CompositionInfo`, `Shadowed`: composition metadata (vocabulary errors, inherited and replaced obligations).
- `CslError`: an error raised while building, with a code such as `E-TYPE` or `E-EVENT`.

## Depends on and used by

- Depends on: `@csh/kernel` (model types, canonical names, digests).
- Used by: `@csh/emit` (its sandbox runner imports `isModule` and `compositionOf`), every specification module in `fixtures/`, the pack in `fixtures/packs/`, and the tests of `@csh/emit` and `@csh/testkit`. `@csh/print` writes text that imports `csl` but does not import it itself.

## Invariants it protects

- No function approves, waives or retires anything; the builder can only produce candidate content (P1, CSH-015).
- Every construct returns plain data. A raw JavaScript value where an expression belongs is marked so that the IR check reports S6, and unsafe JavaScript numbers are refused (P8).
- Vocabulary merges with a pack only when types and units agree; otherwise `E-VOCAB` (main tab, section 6.3, rule 2; P3).
- Weakening an inherited obligation needs an explicit `relax` with an owner and a reason; `relax` of something not inherited is `E-COMPOSE` (main tab, section 6.3, rule 5; P1, CSH-009).
- A transition without `otherwise` leaves the rejected branch unconstrained; the builder adds no frame condition (P10).

## Rationale

The language is an internal DSL so that TypeScript does the type and unit checking and there is no parser to maintain ([ADR-04](../../docs/adr/ADR-04-internal-dsl.md)). State, events and transitions are written in the language itself rather than an external formal notation ([ADR-05](../../docs/adr/ADR-05-model-in-the-language.md)). There is no frame rule ([ADR-06](../../docs/adr/ADR-06-no-frame-rule.md)). Replacing an inherited obligation is recorded as `Shadowed` so that emission can ask the solver whether it strengthens ([ADR-29](../../docs/adr/ADR-29-refinement-by-solver.md)). A profile declares its own vocabulary before `use()` ([A-22](../../ASSUMPTIONS.md)).

## How it is tested

- `test/csl.test.ts`: the builder emits IR that passes every rule, literals are decimal strings, raw values are marked for S6, pack digests are stable, pinned uses and inherited obligations are recorded, `E-VOCAB` on a unit disagreement, replacements and relaxations are recorded, and relaxing a non-inherited obligation is refused; `deterministic` is recorded only when true, a non-boolean is refused, and any other value in the IR is S1.
- `packages/emit/test/static-rules.ts` (run by `static-rules.test.ts`): each line that breaks S1 to S5 must fail to compile.
- Fixtures: F01 to F09 (compile-time and IR rules on the account specification), F70 to F78 (composition with packs).

## Known limits

- Rule S2 depends on branded template-literal unit types; native operators such as `a >= b` on handles cannot all be rejected by the compiler, so S6 on the IR catches the rest (main tab, section 7.6).
- Phase inference for `and(...)` over mixed arguments is this implementation's choice, fixed only by the compile-time fixtures (Implementer's brief, section 10).
- `temporal`, and an `architecture` value not made by the builders, are carried as native content and never evaluated.
- A source file can generate obligations with loops or helpers, so reading the file is not reading the specification; review the printed IR instead.
