# Composable Specification Harness — Formal Specification

Oct 3, 2026 · @Leigh · Version 0.2, design specification, not implemented

## 1. Charter

The Composable Specification Harness (CSH) exists so that software changed quickly, including by AI agents, cannot be declared correct on evidence that does not support the claim.

> Preserve human ownership of purpose, make semantic commitments explicit, and maintain reviewable evidence of alignment as software changes.

Two goals govern every design choice in this document.

- **Safety.** No actor, human or agent, can turn a passing execution, a persuasive explanation or an out-of-date result into an approved claim of conformance. What is not known is reported as unknown.
- **Unity.** Varied requirements (structured sentences, examples, invariants, architectural rules, timed properties, runtime observations) live in one model, are written in one language and receive one vocabulary of results, without being treated as interchangeable.

The practices that constrain software already exist: test-driven and behaviour-driven development, formal models, structured requirements, design documents. Each protects something, and each is judged alone. The harness replaces none of them. It evaluates their outputs together, from the inputs alone, and produces two findings no single practice can:

- **Gaps.** What one practice asserts and the others are silent on, shown so that a person can decide whether the silence matters.
- **Joint conflicts.** A holds, B holds, and A and B cannot both hold.

No evaluation of this kind is complete. The output is a view for informed decisions, not a certificate.

The harness answers five questions for any change:

1. What was intended, and who approved that interpretation?
2. Which obligations refine that intent?
3. What does each piece of evidence establish, and under which assumptions?
4. Where do approved obligations, behaviour and evidence disagree?
5. What further evidence would resolve the remaining uncertainty at least cost?

## 2. Scope and status

CSH is a standalone evaluator: it works from the inputs it is given and is tied to no particular system or toolchain.

Nothing here is implemented or measured. Grammar, interfaces and stage criteria are proposals. SHALL marks a requirement on the harness, SHOULD a default that needs a recorded reason to depart from, MAY an option.

| In scope for this specification | Out of scope until a later version |
| --- | --- |
| The semantic model: obligations, evidence, bindings, decisions | Adapters beyond two reference ones (Section 10) |
| A purpose-built language that existing practices are lifted into (Section 7) | Profiles for any existing repository |
| The authority model for humans and agents | Runtime monitoring and automatic remediation |
| Evaluation of a small typed predicate subset | Importing external formal notations such as Z, TLA+ or Alloy |
| Evidence ledger, invalidation and gate semantics | LLM-assisted inference of links or intent |
| A staged path with exit criteria | The academic paper (kept in draft 0.1) |

Three claims are never made: that the harness discovers all stakeholder intent, that it proves arbitrary program behaviour, or that it is without precedent.

## 3. Normative principles

Ten principles bind every later section; a design choice that breaks one is a defect in the specification.

| ID | Principle | Consequence |
| --- | --- | --- |
| P1 | Humans own purpose | Only a recorded decision by an authorised person moves an obligation or binding to approved |
| P2 | Execution is not conformance | A test result is stored as an execution fact and never doubles as a conformance verdict |
| P3 | Unknown is a result | Missing semantics, bindings, evidence or solver answers yield unknown and stay in every denominator |
| P4 | Native meaning is preserved | What cannot be interpreted is retained in its original form and reported, never dropped |
| P5 | Evidence is scoped and perishable | Evidence supports one claim, in one scope, for one snapshot; a changed dependency makes it stale |
| P6 | Powers are separated | Extracting, proposing, approving, evaluating and gating are distinct capabilities held by distinct actors |
| P7 | Minimum sufficient formality | Assurance effort is proportionate to the consequence of being wrong, and its cost is measured |
| P8 | The core is deterministic | The same pinned inputs give the same verdicts; inference may propose and never decides |
| P9 | A waiver is not a pass | A waiver changes whether delivery proceeds; the violation stays recorded as a violation |
| P10 | Assumptions are elevated | The harness assumes nothing silently. Every assumption is a named node with a source and an owner; anything unstated is unconstrained and is shown as such |

P1, P3, P6 and P9 are the safety principles. P4 and the shared result vocabulary in Section 4 carry unity. P7 is the Lean stopping rule.

## 4. How it works

The harness compiles specifications into a typed model, attaches evidence to obligations through approved bindings, and reports four independent facts about each obligation.

### 4.1 The run, in order

1. **Snapshot.** Record the exact revision and content digest of every input.
2. **Compile.** Evaluate specification modules in a sandbox, check the static rules, emit the intermediate representation (IR).
3. **Bind.** Connect domain terms to the places where evidence reports them. New bindings are candidates.
4. **Decide.** An authorised person approves, rejects or supersedes candidates. Decisions bind to digests.
5. **Plan.** For each approved obligation, select the evaluators its assurance policy requires. Unsupported obligations stay listed.
6. **Evaluate.** Run deterministic checks against the specification and against imported evidence.
7. **Assess.** Combine verdict and applicability per obligation, with witness and limitations.
8. **Gate.** Apply delivery policy to the assessments for this snapshot only.

### 4.2 The kernel

Eight node families make up the whole model.

| Family | Holds |
| --- | --- |
| Intent | Purpose, owner, value statement, assurance demand |
| Obligation | Invariant, requirement, architectural rule or timed property |
| Example | A concrete pre-state, event and expected outcome |
| Model | Vocabulary: state, events, enumerations, units |
| ImplementationElement | A named thing that carries responsibility for an obligation |
| Binding | The interpretation between a domain term and an observed value |
| Evidence | A recorded execution, analysis result, witness or review |
| Decision | Approval, rejection, supersession or waiver, with actor and scope |

Relations between nodes are typed (refines, implements, exercises, checks, supports, constrains, depends on, conflicts with, supersedes). "Satisfies" is never stored as a relation; it is derived by assessment.

### 4.3 Four axes, never merged

| Axis | Values | Set by |
| --- | --- | --- |
| Authority | candidate, approved, retired | Recorded human decision |
| Verdict | satisfied, violated, unknown, conflicting | Evaluator, from evidence |
| Applicability | current, stale, inapplicable, unavailable | Dependency digests |
| Disposition | allow, block, review, waived | Gate policy |

A single valid violating witness refutes a universal obligation however many passing witnesses exist. Results are never averaged into a score.

### 4.4 Core judgments

For context C, assumptions A, invariant I and transition T, the specification-level violation query is:

```latex
\exists s, s'.\; C(s) \land A(s) \land I(s) \land T(s,s') \land \neg I(s')
```

A model of this query is a counterexample in the specification, not yet a defect in an implementation. For an imported witness w from a passing execution, the conformance violation is:

```latex
LocalPass(w) \land Applicable(I, w) \land \neg I(post(w))
```

Without an approved binding that makes `Applicable` true, the verdict is unknown. Refinement of Q by P checks that A and P together are satisfiable, then that A and P imply Q, so that vacuous success is caught.

## 5. How it collaborates

Collaboration is defined by capabilities, and the capability to approve is never held by an agent or by the harness itself.

| Actor | May | May never |
| --- | --- | --- |
| Intent owner (person) | Approve intents and obligations; approve scoped waivers with expiry | Approve without a recorded rationale |
| Domain reviewer (person) | Approve or reject bindings and refinements | Change an obligation while reviewing its binding |
| Contributor (person) | Author specifications, submit evidence, propose changes | Approve their own waiver once a second maintainer exists |
| Agent (AI) | Read the model, author candidate specifications and bindings, request evaluation, read counterexamples, propose changes | Approve, waive, retire, or alter a recorded decision |
| Evaluator | Return evidence with witness and limits | Modify obligations or bindings |
| Gate | Compute a disposition for one snapshot | Rewrite a verdict or carry a decision to a later snapshot |

### 5.1 What makes this safe for agent-driven work

- **Authority is not text.** The language has no word for "approved". Approval exists only as a decision record bound to the digest of the exact fragment approved, so editing a file cannot grant it.
- **Change voids approval.** Any semantic change to an approved fragment returns it to candidate. An agent that rewrites an obligation to match the code produces a candidate and a visible gap.
- **Explanations carry no weight.** An agent's reasoning is stored as a proposal. Only a deterministic evaluator or a human decision changes a result.
- **Inputs are data.** Specification prose, test names and evidence payloads are never treated as instructions to the harness.
- **Decisions do not travel.** A gate decision names its snapshot; a later patch needs a new evaluation.

### 5.2 The review loop

1. A contributor or agent submits a change with candidate fragments.
2. The harness reports what the change makes candidate, stale, unknown or violated.
3. A reviewer sees each candidate beside the evidence it would unlock, ordered by impact and age.
4. The reviewer approves, rejects or asks for a narrower candidate. The decision is appended to the ledger.
5. The harness re-evaluates only what the decision affects.

Review queues are limited in size. A growing queue is a signal to narrow scope, in line with P7.

## 6. How it unifies

Unity comes from one model and one result vocabulary shared by every kind of requirement, and not from translating every notation into one logic.

### 6.1 Varied requirements, one home

| Kind of requirement | Language construct | Evidence that can support it | What that evidence cannot show |
| --- | --- | --- | --- |
| State rule | `invariant` | Solver check on the specification; witness post-states | Behaviour outside the bound vocabulary |
| Triggered behaviour | `requirement` | Witness with matching trigger and outcome | All inputs, from a finite set of witnesses |
| Concrete case | `example` | A matching execution | A universal claim |
| Structure | `architecture` | Dependency facts supplied by an analyser | Dynamic calls or deployment topology |
| Timed response | `temporal` | A complete trace on a named clock | Unbounded liveness; anything from sampled metrics |
| Purpose | `intent` | Human approval and product evidence | Anything derivable from passing tests |

### 6.2 Three surfaces over the same IR

- **Authoring.** The language in Section 7 is the common form. People write approved intent in it; adapters lift what existing practices assert into it (6.4).
- **Evidence.** Witnesses and analysis results arrive in one neutral envelope (Section 9). Adapters produce it and sit outside the core.
- **Query.** Questions such as "approved intent with no current evidence" or "what goes stale if this binding changes" read the same graph.

### 6.3 Composition

Reusable sets of vocabulary and obligations are **packs**; a **profile** composes packs with local obligations for one system.

1. Imports are pinned by version, and the resolved set produces a lock digest.
2. Vocabulary merges only when types and units agree; a disagreement is an error.
3. Applicable obligations combine by conjunction.
4. A local obligation may strengthen an inherited one through a refinement check or a recorded review.
5. Weakening needs an explicit, owned decision that names what is relaxed. It is never presented as refinement.
6. Inconsistent obligations are reported before any evidence is evaluated against them.

For composed components, a local guarantee holds only under its stated assumptions. A system-level claim also needs those assumptions discharged; a cycle of mutual assumptions is reported as unresolved.

### 6.4 Interoperating with existing practice

Each practice is treated as a source of claims, and every claim is lifted into the one language so that claims from different practices can be compared.

| Practice | What it asserts | Lifted as | How far lifting is mechanical |
| --- | --- | --- | --- |
| TDD, unit tests | Concrete executions with asserted outcomes | `example`, plus a witness when run | Supported assertion forms only; the rest stay candidate |
| BDD scenarios | Agreed given, when, then cases | `example` | Structure yes; step meaning needs a binding |
| Structured requirements | Triggered behaviour | `requirement` | Sentences become identified items that a requirement cites; the predicate is written by a person |
| Formal models | State rules and transitions | `invariant`, `requirement` | Within the predicate subset; the rest is kept native |
| Design documents, decisions | Structural and policy constraints | `architecture`, `invariant`, `assume` | Interpreted; always candidate until reviewed |
| Interface schemas | Shapes and value limits | `invariant` over event parameters | Yes |

A lifted claim keeps its source, span and digest. Lifting never approves anything. What cannot be lifted is retained in its native form and appears in the gap view as unliftable, so it is never mistaken for silence.

### 6.5 The two findings

**Gap view.** For each term, event and obligation, the view shows which sources assert it, which exercise it, which are silent and which hold something unliftable. It surfaces, for example, an approved rule with no boundary example, a passing test with no rule behind it, and a term one source uses that no vocabulary defines.

**Joint conflict.** In a shared context C, two claims conflict jointly when each is satisfiable alone and their conjunction is not:

```latex
SAT(C \land A) \quad SAT(C \land B) \quad UNSAT(C \land A \land B)
```

For more than two claims the harness reports a minimal conflicting set: remove any member and the rest hold together. The report names each member, its source, and the shared terms on which they collide.

The harness offers three readings and chooses none:

1. One of the claims is wrong.
2. A context separates them, and a guard or assumption is missing.
3. The intent is undecided, and an open decision is recorded against an owner.

Claims that differ in unit, scope or context are reported as not comparable until bound. They are not reported as conflicts.

### 6.6 Worked case

- **A, from a formal model:** the balance never falls below the floor, and the floor is zero. The model checks.
- **B, from a passing unit test:** from a balance of 5,000, a withdrawal of 10,000 is accepted and leaves minus 5,000 with the floor still zero.
- **C, from a design note:** premium accounts may overdraw to an agreed limit.

A holds alone. B holds alone, as a transition that happened. A and B together have no model; the minimal conflicting set is A and B, colliding on the balance after the event. C hints at reading 2, but no vocabulary defines "premium", so C lifts only as a candidate and appears in the gap view. The owner now has a decision with its evidence laid out, which is the purpose of the tool.

## 7. The specification language

The language (working name **CSL**) is an internal DSL in TypeScript: a specification is a TypeScript module that builds a typed model as data, and that emitted model, not the source text, is what is digested, approved and evaluated.

This supersedes the standalone grammar chosen earlier on 3 October 2026. The reasons are familiarity, the TypeScript compiler doing type and unit checking for free, and no parser to maintain. The language is also the formal notation: state, events and transitions are defined in it, so version 1 depends on no external formal language.

The code below is a proposed API sketch. It has not been compiled.

### 7.1 Design goals

- **Familiar.** A TypeScript developer can read and write a specification with their existing editor, types and tooling.
- **Data, not behaviour.** Every construct returns a plain IR node. Predicates are built from typed combinators such as `a.gte(b)`, so they can be inspected, digested and translated for a solver.
- **Checked twice.** The TypeScript compiler checks types and units while authoring; the harness checks the emitted IR.
- **No authority in source.** No function in the API approves, waives or retires anything.
- **Deterministic emission.** A module is evaluated with no file, network, clock or random access. The same source emits the same IR.

### 7.2 Worked example

```ts
import { system, int, unit, and } from "csl";

const EUR = unit("minor", "EUR");

export default system("AccountService", (s) => {
  const Outcome = s.enum("Outcome", ["Accepted", "Rejected"]);

  const Account = s.state("Account", {
    balance: int(EUR),
    floor: int(EUR),
  });

  const Withdraw = s.event("Withdraw", {
    on: Account,
    args: { amount: int(EUR) },
    returns: Outcome,
  });

  // The formal model: what a withdrawal does to the state.
  s.transition(Withdraw, ({ pre, post, args, result }) => ({
    when: pre.balance.minus(args.amount).gte(pre.floor),
    then: and(
      result.eq(Outcome.Accepted),
      post.balance.eq(pre.balance.minus(args.amount)),
      post.floor.eq(pre.floor),
    ),
    otherwise: and(
      result.eq(Outcome.Rejected),
      post.balance.eq(pre.balance),
      post.floor.eq(pre.floor),
    ),
  }));

  s.policy("FundsSafety", {
    require: ["ApprovedBinding", "BoundaryWitness", "SolverCheck"],
    reject: ["MockOnly"],
  });

  s.intent("ProtectFunds", {
    owner: "FinanceDomainOwner",
    value: "Prevent withdrawals below the approved account floor",
    assurance: "FundsSafety",
  }, (i) => {
    i.assume("PositiveAmount", Withdraw.args.amount.gt(EUR(0)));

    i.invariant("MinimumBalance", Account.balance.gte(Account.floor));

    i.requirement("RejectInsufficientFunds", {
      when: Withdraw,
      and: ({ pre, args }) => pre.balance.minus(args.amount).lt(pre.floor),
      shall: ({ result }) => result.eq(Outcome.Rejected),
      ensures: ({ pre, post }) => post.balance.eq(pre.balance),
    });

    i.example("RejectAtBoundary", {
      given: { balance: EUR(5000), floor: EUR(0) },
      when: Withdraw({ amount: EUR(10000) }),
      then: ({ post, result }) =>
        and(result.eq(Outcome.Rejected), post.balance.eq(EUR(5000))),
    });
  });

  s.bind(Account.balance, "balanceMinor");
  s.bind(Account.floor, "minimumBalanceMinor");
});
```

The arrow functions are called once during emission with symbolic handles for `pre`, `post`, `args` and `result`. They return expression trees; they never run against real values.

Emitting this module yields a vocabulary, one transition, one intent, two obligations, one example, one assumption and two bindings, all at authority *candidate*.

### 7.3 Static rules

| Rule | A specification is rejected when | Caught by |
| --- | --- | --- |
| S1 | A field, parameter or enumeration member does not exist | TypeScript compiler |
| S2 | Two sides of a comparison or sum differ in type or unit | TypeScript compiler, through branded unit types |
| S3 | A post-state or result is used in an invariant, an assumption or a `given` | TypeScript compiler |
| S4 | An intent lacks an owner, a value statement or an assurance policy | TypeScript compiler |
| S5 | A binding targets something that is not a state field, parameter or result | TypeScript compiler |
| S6 | A raw JavaScript value or function remains where an expression tree is required | Harness, on the IR |
| S7 | An example asserts a value its `given` and `when` do not determine | Harness, on the IR |
| S8 | A pack import is unpinned, or a policy names an undefined method | Harness, on the IR |
| S9 | Two emissions of the same module differ | Harness, on the IR |

### 7.4 Checks on the specification alone

Four checks run before any evidence exists:

1. **Consistency.** Assumptions and obligations have a common model.
2. **Example agreement.** Each example satisfies the obligations whose trigger it meets.
3. **Vacuity.** Each requirement's trigger is reachable.
4. **Preservation.** Each transition keeps each invariant, using the query in 4.4.

In the example all four pass. Remove the `otherwise` branch and preservation fails with a concrete pre-state, which is the formal model grounding the rest.

There is no frame rule. A state field that a transition does not mention is unconstrained after the event, never presumed unchanged (P10). The gap view lists every such field, so the author either constrains it or records an assumption by name.

### 7.5 Lifted claims

`s.source(name, { kind, at })` declares an input, and `s.claims(source, (c) => { ... })` holds what that input asserts, using the same `invariant`, `requirement` and `example` builders. An intent block carries purpose and awaits approval; a claims block records what a source says.

Adapters do not write TypeScript. They emit IR directly, in the same JSON form a module emits. A canonical printer renders any IR back as CSL TypeScript so that lifted claims can be read and reviewed in the same notation as hand-written ones.

Joint evaluation runs across the model, every intent and every claims block that share vocabulary. A unit test lifted as an example that accepts the withdrawal and leaves minus 5,000 with the floor still zero conflicts with both `MinimumBalance` and the transition, and the report names that minimal set.

### 7.6 Costs of an internal DSL

| Cost | Containment |
| --- | --- |
| Source is code: a loop or helper can generate obligations, so reading the file is not reading the specification | Approval is of the emitted IR, shown through the canonical printer; the digest is of the IR |
| A module could read files, time or the network | Emission runs in a sandbox with none of these; the sandbox joins the trusted base |
| TypeScript has no operator overloading, so `a >= b` on handles is a silent mistake | Handle types reject native comparison where the compiler allows; rule S6 catches the rest |
| Readers who do not know TypeScript | The IR is language-neutral JSON, and the canonical print is regular enough to read without knowing the host language |

### 7.7 Deliberately excluded from version 1

Quantifiers over collections, real-number arithmetic, unbounded liveness, concurrency interleavings, generation of tests from prose, and importing external formal notations. Each is added only with a stated semantics and a rejecting fixture.

## 8. Requirements on the harness

Twenty-one requirements govern the harness; CSH-001 to CSH-014 keep their identifiers from draft 0.1, and CSH-015 to CSH-021 are new for the language, the authority model and joint evaluation.

| ID | Requirement | Principle |
| --- | --- | --- |
| CSH-001 | WHEN an artifact is ingested, THE HARNESS SHALL preserve its source identity, revision, content digest and source span where available. | P4 |
| CSH-002 | WHEN a construct cannot be represented, THE HARNESS SHALL retain the original and report the unsupported semantics. | P4 |
| CSH-003 | WHEN a semantic relationship is proposed, THE HARNESS SHALL mark it candidate until an authorised person approves it or a supported deterministic rule establishes it. | P1 |
| CSH-004 | WHEN a local test passes, THE HARNESS SHALL retain that execution result independently of every conformance verdict. | P2 |
| CSH-005 | WHEN a valid witness violates an applicable approved obligation, THE HARNESS SHALL report the obligation, witness, binding, assumptions and affected revisions. | P2 |
| CSH-006 | IF required evidence or semantics are unavailable, THEN THE HARNESS SHALL report the obligation as unknown. | P3 |
| CSH-007 | WHEN an evidence dependency changes, THE HARNESS SHALL mark that evidence stale before it is used for the new snapshot. | P5 |
| CSH-008 | WHERE a profile selects an evaluator, THE HARNESS SHALL check its declared capabilities before scheduling an obligation. | P3 |
| CSH-009 | WHEN inherited and local obligations conflict, THE HARNESS SHALL expose the conflict and require a recorded resolution. | P1 |
| CSH-010 | WHEN a gate evaluates a change, THE HARNESS SHALL bind its decision to the exact source, specification, profile and evidence snapshots. | P5 |
| CSH-011 | WHILE advisory mode is active, THE HARNESS SHALL report findings without blocking delivery. | P7 |
| CSH-012 | WHEN a runtime observation is used, THE HARNESS SHALL record deployment identity, interval, sampling policy and completeness assumptions. | P5 |
| CSH-013 | WHEN a waiver is applied, THE HARNESS SHALL retain the underlying finding and record scope, approver, rationale and expiry. | P9 |
| CSH-014 | WHEN a profile is composed, THE HARNESS SHALL resolve extension versions and produce a reproducible configuration digest. | P8 |
| CSH-015 | WHEN a specification source is compiled, THE HARNESS SHALL derive authority only from recorded decisions and never from source text. | P1 |
| CSH-016 | IF an approval, waiver or retirement is submitted under an agent identity, THEN THE HARNESS SHALL reject it and record the attempt. | P6 |
| CSH-017 | WHEN the semantic digest of an approved fragment changes, THE HARNESS SHALL return that fragment to candidate. | P1 |
| CSH-018 | WHEN a specification is compiled, THE HARNESS SHALL check consistency, example agreement and vacuity before evaluating any evidence. | P8 |
| CSH-019 | WHEN claims that are each satisfiable in a shared context are jointly unsatisfiable, THE HARNESS SHALL report a minimal conflicting set with the source of each member. | P2 |
| CSH-020 | WHEN an evaluation completes, THE HARNESS SHALL produce a gap view showing, per term and obligation, which sources assert it, exercise it, are silent on it or hold unliftable content. | P3 |
| CSH-021 | IF two claims differ in unit, scope or context, THEN THE HARNESS SHALL report them as not comparable and SHALL NOT report a conflict. | P3 |

Non-functional targets: deterministic replay for pinned inputs; bounded time and memory per job; isolated execution of third-party evaluators; local operation by default; no dependency from the kernel to a test framework, database, solver or agent product.

Once the language exists, these requirements are restated in it and the harness evaluates itself against them.

## 9. Reference architecture

The harness is a hexagon: a deterministic core with no outward dependencies, four driving ports on one side and four driven ports on the other.

&#91;embedded content: hexagonal layout · 4 driving ports, core, 4 driven ports\]

People and agents enter on the left; everything the core depends on sits behind a port on the right. The Review port is the only path that changes authority.

### 9.1 Ports

| Port | Direction | Contract |
| --- | --- | --- |
| Author | Driving | Accepts specification sources; returns diagnostics and candidate fragments |
| Review | Driving | Accepts decisions from authenticated people; appends to the ledger |
| Evaluate and query | Driving | Runs planned jobs for a snapshot; answers graph queries; read-only on authority |
| Gate | Driving | Returns a disposition for one snapshot under one policy |
| Evaluator | Driven | Declares capabilities; returns evidence, witness and limits; timeouts return unknown |
| Evidence envelope | Driven | Imports witnesses in one neutral format; payloads are data, never instructions |
| Decision ledger | Driven | Append-only; each record names actor, fragment digest, scope and rationale |
| Store and reports | Driven | Immutable snapshots, content-addressed blobs, source-linked findings |

### 9.2 Evidence envelope (proposed)

```
{
  "schema": "csh-witness/v1",
  "execution": { "id": "...", "localResult": "passed", "mocked": [] },
  "event": { "name": "Withdraw", "args": { "amount": 10000 } },
  "pre":  { "balanceMinor": 5000, "minimumBalanceMinor": 0 },
  "post": { "balanceMinor": -5000 },
  "result": "Accepted",
  "subject": { "buildDigest": "...", "environment": "..." },
  "tool": { "id": "...", "version": "...", "configDigest": "..." }
}
```

Any test runner or agent can emit this shape. Framework adapters that produce it are separate packages outside the core.

### 9.3 Trusted base

The parts whose defects could produce a false "satisfied" are: the emitter and its sandbox, the predicate translator, the binding resolver, snapshot and digest handling, the ledger, and the gate. The harness's own tests target these first. Evaluators and adapters are untrusted and run isolated.

### 9.4 Form

A TypeScript modular monolith delivered as a library and a command-line tool, with solvers run as subprocesses. Storage starts as SQLite plus content-addressed files; the graph is a logical model and needs no graph database.

## 10. Path to implementation

Nine stages run in order, each closed by an exit criterion and none by a date; the semantics are fixed on paper before any code.

1. **Semantic contract.** IR schema, meaning of `csh-predicate-v1`, the four axes, and a set of golden fixtures with intended outcomes. *Exit:* an independent reviewer classifies every fixture correctly from the document alone.
2. **Language.** The TypeScript API with branded unit types, state and transition definitions, sandboxed emission, IR checks and the canonical printer. *Exit:* every static rule S1 to S9 has an accepting and a rejecting fixture; source to IR to canonical text is stable.
3. **Specification checks.** Consistency, example agreement, vacuity and preservation of invariants by the model's transitions, through one SMT back end. *Exit:* seeded inconsistent and vacuous specifications are caught; a solver timeout yields unknown.
4. **Lifting.** `source` and `claims` declarations, and two reference adapters: an example-based test format and structured requirements. Both lift into the vocabulary of the formal model, which is written in the language itself from stage 2. *Exit:* test executions lift as example claims in the model's vocabulary, and requirement sentences become citable items; every construct that cannot be lifted is reported as unliftable.
5. **Joint evaluation and gap view.** Set-wise consistency with a minimal conflicting set; the gap view. *Exit:* seeded cases where A holds, B holds and both together fail are found with the right minimal set; cases separated by context are not reported as conflicts.
6. **Evidence.** Witness envelope, binding resolution, verdicts. *Exit:* the passing-test, violated-invariant case is reproduced, and the same witness without a binding yields unknown.
7. **Authority and invalidation.** Decision ledger, digests, staleness, agent identities. *Exit:* a changed predicate returns to candidate; stale evidence never certifies; an agent approval is rejected and logged.
8. **Composition.** Packs, profiles, lock digest, conflict reporting. *Exit:* a second, unrelated domain is specified with no kernel change, and a silent weakening is refused.
9. **Gate.** Advisory then enforcing dispositions, waivers with expiry. *Exit:* a waived violation still reports as violated; a decision for one snapshot is refused for another.

Stages 1 to 5 alone deliver the standalone view of gaps and joint conflicts. After stage 9, candidates in no fixed order: further adapters for design documents, schemas and other formal notations, the `architecture` and `temporal` evaluators, runtime observation, and assisted candidate inference with measured review cost.

Each stage ends with a short written review of effort spent against findings gained. A stage that costs more than it reveals is narrowed before the next begins (P7).

## 11. Decisions and open questions

Twenty-two decisions are settled; no questions remain open.

| ID | Decision | Basis |
| --- | --- | --- |
| D1 | Standalone evaluator: works from its inputs alone and is tied to no particular system | Stated 3 October 2026 |
| D2 | An internal DSL in TypeScript; the emitted IR is the contract | Stated 3 October 2026; supersedes the standalone grammar chosen earlier that day |
| D3 | Safety and unity are the two governing goals | Stated 3 October 2026 |
| D4 | Authority cannot be expressed in source text | Follows from P1 and P6 |
| D5 | Four separate result axes; no aggregate score | Carried from draft 0.1 |
| D6 | Hexagonal modular monolith; evaluators isolated | Carried from draft 0.1 |
| D7 | Adapters sit outside the core; two reference adapters are in version 1; profiles for named systems are not | Follows from D1 |
| D8 | TypeScript for the reference implementation | Stated 3 October 2026 |
| D9 | Solo maintainer initially: the maintainer may approve their own obligations, bindings and waivers with a recorded rationale, and every report marks them self-approved. Agents still cannot approve. | Solo stated 3 October 2026; the self-approval rule is proposed as its consequence |
| D10 | The primary outputs are the gap view and joint conflicts across existing practices; the language is the common form inputs are lifted into, and the output informs decisions without certifying | Stated 3 October 2026 |
| D11 | The formal model is written in the language itself from stage 2 and grounds the shared vocabulary; it is not a later add-on | Stated 3 October 2026 |
| D12 | No default assumptions: unmentioned state is unconstrained, and every assumption is explicit and named (P10) | Stated 3 October 2026 |
| D13 | Approval is a signed commit to a ledger file in the repository; unsigned or agent-signed entries carry no authority | Stated 3 October 2026 |
| D14 | Emission runs in a locked-down subprocess with file, network, clock and random access denied | Stated 3 October 2026 |
| D15 | Z3 with linear integer arithmetic is the pinned solver for csh-predicate-v1 | Stated 3 October 2026 |
| D16 | Requirement fields keep the EARS words exactly: while, when, shall | Stated 3 October 2026 |
| D17 | When a second maintainer joins, self-approval ends and earlier self-approved decisions are flagged until that person reviews them | Stated 3 October 2026 |
| D18 | An edit keeps its approval only when the emitted model, and so its digest, is identical | Stated 3 October 2026 |
| D19 | The language keeps the working name CSL until the first implementation | Stated 3 October 2026 |
| D20 | MIT licence | Stated 3 October 2026 |
| D21 | Requirement sentences are cited, not translated: each becomes an identified item that a person-written requirement cites | Stated 3 October 2026 |
| D22 | The first build runs all nine stages end to end, with C4 diagrams, READMEs and rationale, so the whole system can be evaluated before any part is refined | Stated 3 October 2026 |

Open questions:

None remain as of 3 October 2026. New questions are added here as stage 1 raises them.

## 12. Lineage

This specification restates draft 0.1 (1 October 2026) as a standalone design and removes everything tied to a particular system.

| Carried over | Changed | Set aside |
| --- | --- | --- |
| Kernel node families and relations | Language is an internal TypeScript DSL | Profiles for named repositories |
| Verdict and applicability semantics | Authority moved out of source into a ledger | Adapters beyond the two reference ones |
| Requirements CSH-001 to CSH-014 | Evidence enters through one neutral envelope | The paper draft and evaluation protocol |
| Composition rules for packs and profiles | Stages reordered: language before evidence | Runtime and LLM-assisted inference |

Prior work the design must acknowledge and be compared against, as listed in draft 0.1 and not re-verified for this version:

- [EARS](https://doi.org/10.1109/RE.2009.9): the sentence patterns the requirement form follows.
- [The oracle problem survey](https://doi.org/10.1109/TSE.2014.2372785): why a passing execution does not settle correctness.
- [NASA FRET](https://github.com/NASA-SW-VnV/fret): restricted-English requirements with precise semantics; the closest precedent for the language.
- [Capra](https://projects.eclipse.org/projects/modeling.capra): adapter-based traceability across arbitrary artifacts.
- [KAOS](https://webperso.info.ucl.ac.be/~avl/gore.php): goal refinement, assumptions and conflict analysis.
- [SACM 2.3](https://www.omg.org/spec/SACM/2.3/PDF): the separation of claim, evidence and argument.
- [SMT-LIB](https://smt-lib.org/): the interface for the predicate back end.

The contribution worth testing is the combination: a closed language, authority held outside it, perishable scoped evidence, and one result vocabulary across kinds of requirement.

## 13. Implementation pack

Eight further tabs turn this specification into something an implementer can build from. Where a tab and this one disagree, this one governs and the tab is corrected.

- 1 Semantic contract: the model schema, what predicates mean, how results are computed, and the golden fixtures.
- 2 Language reference: the TypeScript API of the language.
- 3 Joint evaluation: the checks, the joint-conflict algorithm, the gap view and the report.
- 4 Evidence and adapters: the witness format, lifting, and the two reference adapters.
- 5 Authority and ledger: the ledger, signed approval, digests, invalidation and the gate.
- 6 Implementer's brief: repository layout, tasks per stage, acceptance tests and working rules.

* 7 Architecture (C4): context, container and component diagrams, and the documentation the build must produce.
* 8 Rationale: each decision with its reason, the alternative rejected and the cost accepted.
