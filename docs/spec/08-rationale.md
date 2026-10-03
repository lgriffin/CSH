# Rationale

This tab records why the design is the way it is: sixteen decision records, each with the reason, the alternative that was rejected and the cost that was accepted. The D numbers refer to the decision table in the main tab, section 11.

In the repository each row becomes one file in `docs/adr/` with five headings: Context, Decision, Alternatives, Consequences, Status. The implementer adds a record for every choice of their own.

## 1. Purpose and shape

| Record | Decision | Why | Rejected | Cost accepted |
| --- | --- | --- | --- | --- |
| ADR-01 (D1, D10) | A standalone evaluator of what existing practices already produce; its outputs are a gap view and joint conflicts | The practices exist and each works alone; the unmet need is seeing them together, including where A holds, B holds and both cannot | Replacing the practices with one method; building it inside one existing system first | Inputs must be lifted, and lifting is partial; the result is a view for decisions, never a certificate |
| ADR-02 (D3) | Safety and unity govern every choice | The goal is safe AI-assisted development across varied kinds of requirement | Optimising for coverage numbers or speed of adoption | Some convenient features are refused |
| ADR-03 (D22) | The first build runs all nine stages end to end, with full documentation | A whole system can be evaluated holistically; a partial one hides how the parts interact | Pausing for owner review after each stage | Choices made during the build are provisional and must be registered as assumptions |

## 2. Language and model

| Record | Decision | Why | Rejected | Cost accepted |
| --- | --- | --- | --- | --- |
| ADR-04 (D2, D8, D16, D19) | An internal DSL in TypeScript, working name CSL; the emitted model is the contract; requirement fields keep the EARS words | Familiarity; the compiler checks types and units; no parser to maintain; approvers read familiar wording | A standalone grammar; YAML; extending existing requirement files | A specification file is code, so approval attaches to the emitted model and emission needs a sandbox |
| ADR-05 (D11) | The formal model is written in the language itself, from stage 2 | It grounds the shared vocabulary and makes preservation checkable from the start | Importing Z, TLA+ or Alloy; adding a model later | Limited to linear integers, enumerations and booleans; no concurrency in version 1 |
| ADR-06 (D12, P10) | No silent assumptions and no frame rule: unmentioned state is unconstrained | Elevated assumptions: every assumption is named, owned and visible | Treating unmentioned fields as unchanged | Specifications are more verbose; an example must state the post-state it relies on |
| ADR-07 (D18) | Approval follows the digest of the emitted model | Formatting and renaming should not cost a re-approval; any change of meaning should | Resetting approval on any edit; digesting source text | Canonical form sits in the trusted base and must be exactly right |

## 3. Evaluation

| Record | Decision | Why | Rejected | Cost accepted |
| --- | --- | --- | --- | --- |
| ADR-08 | A joint conflict is an input for which no outcome satisfies all obligations (query Q-FEAS) | Two rules that are each satisfiable can still collide on overlapping inputs; plain joint satisfiability misses that | Checking only that the conjunction is satisfiable; checking pairs only | A quantified query, which may be slow and may return unknown |
| ADR-09 (D15) | Z3 with linear integer arithmetic | Decidable for the chosen subset; supports unsatisfiable cores for minimal sets | Another solver; staying solver-neutral | One solver in the trusted base; its JavaScript bindings are to be verified |
| ADR-10 (D5) | Four separate result axes and no aggregate score | A green test or a waiver must never overwrite a verdict; one violation outweighs any number of passes | A single status; a percentage | Reports are longer and need reading |
| ADR-11 | `csh check` always exits zero when it completes; only the gate blocks | Reporting and judging are separate powers (P6) | Failing the build from the checker | Two commands where one might seem enough |

## 4. Inputs

| Record | Decision | Why | Rejected | Cost accepted |
| --- | --- | --- | --- | --- |
| ADR-12 (D7) | Adapters sit outside the core; version 1 ships two | The core stays independent of any framework | Building framework parsers into the core | Other practices need adapters before they contribute |
| ADR-13 | A passing test lifts as both a claim and a witness | A passing test is its author asserting the outcome is right, so it can conflict with other claims | Treating tests as witnesses only | Lifted examples state every post-state field |
| ADR-14 (D21) | Requirement sentences are cited, not translated | Turning prose into a predicate is interpretation and belongs to a person; a reworded sentence should void the approval of the predicate that cites it | Generating predicates from prose by rules or by a language model | A person writes every predicate |

## 5. Authority and delivery

| Record | Decision | Why | Rejected | Cost accepted |
| --- | --- | --- | --- | --- |
| ADR-15 (D4, D13, D9, D17) | Authority lives outside source, in a ledger of signed commits; solo self-approval is allowed and marked; it ends when a second maintainer joins | An agent can edit any file but cannot sign as a person; solo work is the starting reality and is reported honestly | An approval keyword in source; a separate approval service; relying on branch rules; requiring two people from day one | Protection depends on where the key is kept and where the gate runs; self-approval is weaker and is flagged |
| ADR-16 (D6, D14, D20) | A hexagonal modular monolith; untrusted code in locked-down subprocesses; MIT licence | Ports keep the solver, sandbox and version control replaceable; one process is simple to run | Separate services; an in-process virtual machine for untrusted code; Apache-2.0 | Subprocess start-up cost; the sandbox mechanism is to be verified; no explicit patent grant |

## 6. How the principles map to mechanisms

| Principle | Mechanism that enforces it | Where specified |
| --- | --- | --- |
| P1 Humans own purpose | Signed ledger entries by person keys | Authority tab, section 3 |
| P2 Execution is not conformance | `localResult` stored and never used in a verdict | Evidence tab, section 2 |
| P3 Unknown is a result | Verdict order; solver unknown and timeout rules | Semantic contract, sections 4 and 6 |
| P4 Native meaning preserved | `unliftable` entries with original text | Evidence tab, section 4 |
| P5 Evidence is perishable | Dependency digests and staleness | Authority tab, section 5 |
| P6 Powers are separated | Adapters cannot approve; check cannot block; gate cannot change verdicts | Architecture tab, level 2 |
| P7 Minimum sufficient formality | Policies per intent; stage notes record effort against findings | Implementer's brief, section 7.1 |
| P8 Deterministic core | Double emission; exact evaluation; no language-model calls | Language reference, section 7 |
| P9 A waiver is not a pass | Disposition table | Authority tab, section 6 |
| P10 Assumptions are elevated | No frame rule; unconstrained-after gap; assumptions register | Semantic contract, section 3; Joint evaluation, section 5 |
