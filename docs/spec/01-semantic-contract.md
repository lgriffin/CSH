# Semantic contract

This tab fixes what the model is, what every expression means, and how every result is computed, so that an implementer and a reviewer reach the same answer for each golden fixture without reading code. It is stage 1 of the path. Everything here is proposed and unimplemented.

## 1. The model (`csh-ir/v1`)

The intermediate representation (IR) is plain JSON. A specification module emits exactly one `Module`.

```ts
type Digest = string;                 // "sha256:<64 hex>"

interface Module {
  schema: "csh-ir/v1";
  system: string;
  uses: { pack: string; version: string; digest: Digest }[];
  vocabulary: Vocabulary;
  transitions: Transition[];
  policies: Policy[];
  intents: Intent[];
  sources: Source[];
  claims: ClaimSet[];
  bindings: Binding[];
}

interface Vocabulary {
  units: { id: string; dimension: string; symbol: string }[]; // id "minor(EUR)"
  enums: { name: string; members: string[] }[];
  states: { name: string; fields: Record<string, Type> }[];
  events: { name: string; on: string; args: Record<string, Type>; returns?: Type }[];
}

type Type =
  | { kind: "int"; unit?: string }
  | { kind: "bool" }
  | { kind: "enum"; enum: string };

interface Transition {
  event: string;
  when: Expr;            // over pre and args
  then: Expr;            // over pre, post, args, result
  otherwise?: Expr;      // over pre, post, args, result
}

interface Policy { name: string; require: Method[]; reject: Rejection[] }
type Method = "ApprovedBinding" | "BoundaryWitness" | "SolverCheck";
type Rejection = "MockOnly";

interface Intent {
  name: string; owner: string; value: string; assurance: string;
  assumptions: Assumption[];
  obligations: Obligation[];
  examples: Example[];
}

interface Source { name: string; kind: string; at: string }
interface ClaimSet {
  source: string;
  assumptions: Assumption[];
  obligations: Obligation[];
  examples: Example[];
  unliftable: { span: string; reason: string; text: string }[];
}

interface Assumption { name: string; body: Expr }            // over now and args
type Obligation = Invariant | Requirement | Reserved;
interface Invariant { kind: "invariant"; name: string; state: string; body: Expr } // over now
interface Requirement {
  kind: "requirement"; name: string; event: string;
  while?: Expr;          // over pre
  and?: Expr;            // over pre and args
  shall: Expr;           // over pre, post, args, result
  ensures: Expr[];       // over pre, post, args, result
}
interface Reserved { kind: "architecture" | "temporal"; name: string; native: unknown }

interface Example {
  name: string; event: string;
  given: Record<string, Expr>;   // field -> literal
  args: Record<string, Expr>;    // arg -> literal
  then: Expr;                    // over pre, post, args, result
}

interface Binding { target: Ref; key: string }
type Ref =
  | { k: "field"; state: string; field: string }
  | { k: "arg"; event: string; name: string }
  | { k: "result"; event: string };
```

`Reserved` obligations are carried and reported; version 1 has no evaluator for them, so their verdict is always unknown.

Every obligation and example may also carry `cites?: { source: string; id: string }[]`, which links it to identified items in a source (see the Evidence tab).

## 2. Expressions (`csh-predicate-v1`)

```ts
type Expr =
  | { k: "int"; v: string; unit?: string }            // decimal string, any size, may be negative
  | { k: "bool"; v: boolean }
  | { k: "enum"; enum: string; member: string }
  | { k: "field"; state: string; field: string; at: "now" | "pre" | "post" }
  | { k: "arg"; event: string; name: string }
  | { k: "result"; event: string }
  | { k: "add" | "sub"; l: Expr; r: Expr }
  | { k: "eq" | "ne" | "lt" | "le" | "gt" | "ge"; l: Expr; r: Expr }
  | { k: "and" | "or"; xs: Expr[] }                   // xs has at least one member
  | { k: "not"; x: Expr }
  | { k: "implies"; l: Expr; r: Expr };
```

There is no multiplication, division, quantifier, string or real number. The subset is linear integer arithmetic with finite enumerations and booleans, which keeps every query in section 4 decidable.

### 2.1 Typing

| Form | Operands | Result |
| --- | --- | --- |
| `add`, `sub` | Two `int` with the same unit, or both without a unit | `int` with that unit |
| `lt`, `le`, `gt`, `ge` | Two `int` with the same unit | `bool` |
| `eq`, `ne` | Two operands of identical type, including unit and enumeration name | `bool` |
| `and`, `or`, `not`, `implies` | `bool` | `bool` |

A unit mismatch is an error and is never converted. After type checking, units are erased; they do not reach the solver.

### 2.2 Where each reference is allowed

| Position | `now` | `pre` | `post` | `arg` | `result` |
| --- | --- | --- | --- | --- | --- |
| Invariant body | yes | no | no | no | no |
| Assumption body | yes | no | no | yes | no |
| Transition `when`; requirement `while` | no | yes | no | `when` only | no |
| Requirement `and` | no | yes | no | yes | no |
| `then`, `otherwise`, `shall`, `ensures`, example `then` | no | yes | yes | yes | yes |

When an invariant or assumption is applied to a pre-state or post-state, each `now` reference is read at that state.

## 3. Meaning

A **state** assigns a value to every field. A **step** for event e is a tuple (s, a, s', r): pre-state, arguments, post-state, result. Integers are mathematical integers with no bound.

- **Invariant I** holds in a state when its body evaluates to true there.
- **Assumption A** restricts which states and arguments are considered. It is a premise, never a conclusion.
- **Transition T** holds for a step when `when` is true and `then` is true, or `when` is false and `otherwise` is true. With no `otherwise`, a false `when` leaves the step unconstrained (P10).
- **Requirement R** holds for a step when its trigger (`while` and `and`, each true if absent) is false, or `shall` and every `ensures` are true.
- **Example E** claims that a step exists whose pre-state matches `given`, whose arguments match `args`, and for which `then` is true. Fields absent from `given` are unconstrained.
- A field that no clause constrains after an event may take any value (P10). It is listed in the gap view.

One consequence deserves stating. An example that leaves the balance at minus 5,000 does not conflict with "balance is at least floor" unless it also states the floor afterwards, because an unstated post-state floor could be lower still. F15 and F20 therefore state the post floor. A witness always carries concrete values, so this arises only for hand-written or lifted examples.

## 4. Named queries

Every check is one of these queries. `A` is the conjunction of applicable assumptions, `I(s)` the conjunction of invariants at state s, `R` the conjunction of requirements on the event.

| Query | Formula | Wanted | If not |
| --- | --- | --- | --- |
| Q-STATE | A and I(s) | satisfiable | Invariants conflict; report a minimal set |
| Q-VAC(R) | A and I(s) and trigger of R | satisfiable | R is vacuous |
| Q-FEAS(e) | exists s, a: A and I(s) and, for all s', r: not (R and I(s')) | unsatisfiable | Some input has no outcome meeting all obligations; the model gives that input |
| Q-EX(E) | given and args and then of E, with A, I(s), R, I(s') | satisfiable | The example conflicts with obligations |
| Q-PRES(T, I) | A and I(s) and T and not I(s') | unsatisfiable | The transition breaks the invariant; the model is the counterexample |
| Q-MEET(T, R) | A and I(s) and T and not R | unsatisfiable | The modelled behaviour breaks the requirement |

Q-FEAS is the query behind "A holds, B holds, A and B fail": each obligation is satisfiable alone, and an input exists for which no outcome satisfies them together.

A solver answer of unknown, or a timeout, yields the verdict unknown for every obligation in the query. It is never read as either wanted outcome.

## 5. Canonical form and digests

1. Canonical JSON: object keys sorted by code point, no insignificant whitespace, integers as decimal strings, UTF-8.
2. Named collections (enums, states, events, intents, obligations, examples, bindings) are sorted by name. Operand order inside `and` and `or` is kept as authored.
3. A **fragment** is one assumption, obligation, example, transition or binding.
4. A fragment's digest is SHA-256 over its canonical JSON followed by the sorted digests of every vocabulary declaration it references.
5. The module digest is SHA-256 over the canonical JSON of the whole module.

Rule 4 means that changing a field's type or unit changes the digest of every fragment that mentions it.

## 6. Computing the four axes

**Authority** of a fragment is *approved* when the ledger holds a valid approval for its name and current digest and no later rejection or retirement; *retired* when retired; otherwise *candidate*. See the Authority tab.

**Applicability** of one evidence item to one obligation:

| Value | Condition |
| --- | --- |
| current | Every dependency digest recorded with the evidence equals the snapshot's |
| stale | At least one dependency digest differs |
| inapplicable | The event differs, a referenced term has no approved binding, a bound key is missing, or the policy rejects the evidence |
| unavailable | The policy requires a method for which no evidence exists |

**Verdict** of an approved obligation, decided in this order:

1. *conflicting* if it is in a minimal conflicting set of approved fragments (Q-STATE, Q-FEAS, Q-EX).
2. *violated* if a current, applicable witness makes it false (scope: implementation), or Q-PRES or Q-MEET returns a counterexample for it (scope: specification).
3. *satisfied* if every method its policy requires is met by current, applicable evidence and nothing in step 2 applies.
4. *unknown* otherwise, with the missing items listed.

Candidate obligations are evaluated and reported the same way, marked candidate; they never contribute to a gate.

**Methods** in version 1:

| Method | Met when |
| --- | --- |
| ApprovedBinding | Every term the obligation references has an approved binding |
| BoundaryWitness | A current, applicable witness exists for an event on which some requirement's trigger is true |
| SolverCheck | Q-PRES (for an invariant) or Q-MEET (for a requirement) returns unsatisfiable against every transition of the relevant event, and at least one such transition exists |

**Disposition** is computed by the gate from verdicts, applicability and waivers. See the Authority tab.

## 7. Golden fixtures

All fixtures use the account specification in section 7.2 of the main tab unless stated. Each is an accepting or rejecting test the implementation must reproduce exactly.

### 7.1 Static rules

| ID | Change to the base specification | Expected |
| --- | --- | --- |
| F01 | `floor` declared in minor(USD) | Rejected, S2, at the invariant |
| F02 | Invariant body uses a post-state reference | Rejected, S3 |
| F03 | Intent has no owner | Rejected, S4 |
| F04 | A binding targets the enumeration `Outcome` | Rejected, S5 |
| F05 | `shall` returns the JavaScript value `true` instead of an expression | Rejected, S6 |
| F06 | Example `then` compares post balance with pre floor, and `given` omits floor | Rejected, S7 |
| F07 | Policy requires a method named `PeerReview` | Rejected, S8 |
| F08 | Module reads the clock to choose a literal | Emission fails: access denied; if forced, S9 |
| F09 | Invariant refers to a field named balence, which the state does not declare | Rejected, S1 |

### 7.2 Specification checks

| ID | Change | Expected |
| --- | --- | --- |
| F10 | None | Q-STATE, Q-VAC, Q-FEAS, Q-EX, Q-PRES, Q-MEET all give the wanted outcome |
| F11 | Remove `otherwise` from the transition | Q-PRES fails for MinimumBalance with a counterexample; Q-MEET fails for RejectInsufficientFunds; scope specification |
| F12 | Remove `post.floor.eq(pre.floor)` from `then` | Q-PRES fails (floor may rise above the new balance); gap view lists `floor` as unconstrained on that branch |
| F13 | Add an invariant: balance is less than floor | Q-STATE unsatisfiable; minimal set is the two invariants; both conflicting |
| F14 | Requirement trigger adds: amount is less than zero | Q-VAC fails; requirement reported vacuous under PositiveAmount |
| F15 | Example expects Accepted, a post balance of minus 5,000 and a post floor of 0 | Q-EX unsatisfiable; two minimal sets: example with MinimumBalance, example with RejectInsufficientFunds |
| F16 | Solver budget set to zero | Every obligation unknown, reason solver-timeout; none satisfied |

### 7.3 Joint evaluation

| ID | Inputs | Expected |
| --- | --- | --- |
| F20 | Claims from a model source: MinimumBalance. Claims from a test source: the F15 example | Joint conflict; minimal set names both fragments and both sources; collision term is post balance |
| F21 | Second requirement from another source: withdrawals of at most 10,000 shall be Accepted | Each requirement satisfiable alone; Q-FEAS satisfiable with an input such as balance 5,000, floor 0, amount 10,000; minimal set is the two requirements |
| F22 | As F21, but the second requirement also requires balance minus amount to be at least floor | No conflict |
| F23 | A claim about balance in minor(USD) from a second vocabulary | Reported not comparable; no conflict |
| F24 | An adapter returns one construct it cannot lift | Listed as unliftable in the gap view with its source span; not counted as silence |

### 7.4 Evidence

The base witness is: event Withdraw, amount 10,000, pre balance 5,000, pre floor 0, post balance minus 5,000, post floor 0, result Accepted, local result passed.

| ID | Conditions | Expected |
| --- | --- | --- |
| F30 | Specification and bindings approved; base witness | Execution passed; MinimumBalance violated; RejectInsufficientFunds violated; applicability current; scope implementation |
| F31 | As F30, bindings still candidate | Both obligations unknown, reason binding-not-approved |
| F32 | As F30, witness lacks the post balance key | Both unknown, reason key-missing |
| F33 | As F30, witness declares the account mocked; policy rejects MockOnly | Evidence inapplicable; both unknown, reason evidence-rejected |
| F34 | Witness shows Rejected and balance unchanged; all bindings approved; F10 checks pass | Both obligations satisfied |
| F35 | As F34, but the transition is absent from the specification | Both unknown, reason method-missing: SolverCheck |

### 7.5 Authority and gate

| ID | Action | Expected |
| --- | --- | --- |
| F40 | After approval, change MinimumBalance to strictly greater than | Fragment returns to candidate; its evidence becomes stale |
| F41 | Rename a local TypeScript constant; emitted model identical | Approval kept; nothing stale |
| F42 | Ledger entry added in an unsigned commit | Entry ignored and logged |
| F43 | Approval signed by a key registered as an agent | Rejected and logged |
| F44 | Valid waiver on a violated obligation | Verdict violated; disposition waived. After expiry: disposition block |
| F45 | Gate decision for one snapshot presented for another | Refused |
| F46 | Change the unit of `balance` | Every fragment that references balance returns to candidate |
