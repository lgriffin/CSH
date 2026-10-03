# @csh/kernel

## Purpose

The kernel holds the model (csh-ir/v1) and the expression language (csh-predicate-v1) as TypeScript types, together with typing, canonical JSON, digests, fragment enumeration, IR rule checks and exact evaluation. Every other package reads and writes the model through these definitions, so there is one source of truth for what a specification means.

## Where it sits

The kernel is its own container, "Kernel", a library with no dependencies. It appears in the [containers diagram](../../docs/architecture/containers.mmd), and its components (model types, typing, canonical form, fragments, references, IR rules, evaluator) are in [components-kernel.mmd](../../docs/architecture/components-kernel.mmd).

## Public interface

- `Module`, `Vocabulary`, `UnitDecl`, `EnumDecl`, `StateDecl`, `EventDecl`, `PackUse`, `Type`: the model and its vocabulary. An event may carry `deterministic: true`; S1 refuses any other value.
- `Intent`, `Policy`, `Method`, `Rejection`, `METHODS`, `REJECTIONS`: intents, assurance policies and the version 1 method names.
- `Assumption`, `Obligation`, `Invariant`, `Requirement`, `Reserved`, `Example`, `Transition`, `Binding`, `Relaxation`: the fragment node types.
- `Source`, `ClaimSet`, `Unliftable`, `Cite`: lifted claims, retained native content and citations.
- `Expr`, `Ref`, `At`, `CmpOp`, `Digest`: expressions, references and digest strings.
- `emptyModule`, `emptyVocabulary`, `sameType`, `typeToString`: small model helpers.
- `canonicalJson`, `canonicalModule`, `moduleDigest`, `digestJson`, `digestOf`, `sha256Hex`, `compareCodePoints`, `refName`, `CanonicalError`: canonical form and digests.
- `stableJson`: sorted, indented JSON for files people read (never used for digests).
- `typeExpr`, `checkBool`, `isExprShape`, `Position`, `TypingContext`, `TypingResult`, `ExprTypeError`, `TypeErrorCode`: expression typing and the phase table.
- `validateModule`, `validateVocabulary`, `validateAssumption`, `validateObligation`, `validateExample`, `validateClaimSet`, `ruleOfTypeError`, `ViolationCollector`, `RuleViolation`, `RuleId`: rules S1 to S8 as far as the IR shows them, plus `E-DUP`, `E-NAME` and `E-VOCAB`.
- `Fragment`, `FragmentKind`, `FragmentNode`, `fragmentsOf`, `fragmentDigest`, `declarationsOf`, `MODEL_SOURCE`, `INTENT_SOURCE`: named fragments and their digests.
- `collectRefs`, `bindableTerms`, `termOfField`, `termOfArg`, `termOfResult`, `refOfTerm`, `typeOfRef`, `ExprRefs`, `FieldUse`: the terms an expression references.
- `evaluate`, `evaluateBool`, `mapValuation`, `Value`, `EnumVal`, `Valuation`, `valueEquals`, `valueToString`, `isEnumVal`, `EvalError`: exact evaluation on concrete values with `bigint` integers.

## Depends on and used by

- Depends on: no workspace package and no external package. It uses only `node:crypto` for SHA-256.
- Used by: every other workspace package (`csl`, `@csh/emit`, `@csh/print`, `@csh/solver`, `@csh/check`, `@csh/witness`, both adapters, `@csh/gate`, `@csh/component`, `@csh/run`, `@csh/cli`, `@csh/testkit`). `@csh/ledger` lists it in `package.json` but imports nothing from it.

## Invariants it protects

- The model has no authority field. Nothing in the IR can say "approved", so authority can only come from recorded decisions (P1, CSH-015).
- A fragment's digest covers its canonical JSON and the digests of every declaration it references, so changing a field's unit changes the digest of each fragment that reads it and returns it to candidate (P1, CSH-017).
- An event's `deterministic` joins its dependency digest only when true, so models written before it keep their digests ([ADR-34](../../docs/adr/ADR-34-example-divergence.md)).
- Canonical JSON sorts keys by code point, writes integers as decimal strings and refuses non-integer numbers, so the same model gives the same digest on any platform (P8).
- Typing never converts between units: a comparison across units is a `unit-mismatch` error (P3, CSH-021).
- Evaluation throws `EvalError` on a missing value instead of guessing one, so missing evidence cannot read as a pass (P3, CSH-006).
- Transitions and bindings belong to the pseudo-source `model` (`MODEL_SOURCE`), kept separate from lifted sources (P4, CSH-001).
- The kernel depends on no test framework, solver, database or agent product (main tab, section 8, non-functional targets).

## Rationale

The emitted model, not the TypeScript source, is the contract that is digested and approved ([ADR-04](../../docs/adr/ADR-04-internal-dsl.md), [ADR-07](../../docs/adr/ADR-07-approval-follows-digest.md)). Keeping the kernel free of dependencies is the centre of the hexagonal layout ([ADR-16](../../docs/adr/ADR-16-hexagonal-monolith.md)). The four result axes are defined elsewhere so that the kernel stays a pure model library ([ADR-10](../../docs/adr/ADR-10-four-axes.md)). The `model` pseudo-source is [A-04](../../ASSUMPTIONS.md) and is recorded in [ADR-27](../../docs/adr/ADR-27-query-scope.md). The rules S1 to S5 are repeated on the IR so that IR built by hand or by an adapter is held to them too.

## How it is tested

- `test/kernel.test.ts`: canonical JSON, a pinned digest of a fixed model (digest stability across platforms), fragment digests that change with a referenced unit and stay put for unrelated declarations, property tests with fast-check for typing soundness, unbounded integers, and IR rules S3, S4, S5 and S8.
- Fixtures: F01 to F09 exercise the IR rules and typing through emission. F41 (a renamed TypeScript constant keeps every digest) and F46 (a unit change returns fragments to candidate) exercise fragment digests. F30 to F35 use `evaluate` to judge witnesses.

## Known limits

- The expression language has integers, booleans and enumerations only. Real numbers, quantifiers over collections and liveness are excluded in version 1 (main tab, section 7.7).
- `architecture` and `temporal` obligations are typed as `Reserved`: carried and reported, never evaluated.
- Rules S6 (raw JavaScript values) and S9 (two emissions differ) can only be fully checked during emission, so they live in `@csh/emit`.
