# Joint evaluation and gap view

This tab specifies how the harness evaluates a model with no evidence at all: the checks it runs, how it finds cases where each claim holds and the claims together fail, and the gap view and report it produces. It covers stages 3 and 5 of the path. Everything here is proposed and unimplemented.

## 1. Inputs and order of work

The input is one emitted model, containing the vocabulary, transitions, intents and any claims lifted from sources.

1. **Type-check claims.** Hand-written intents were checked at emission. Lifted claims are checked here; a claim that fails on a unit or type is moved to the not-comparable list with the reason, and takes no further part.
2. **Build the pool.** The pool is every assumption, invariant, requirement, example and transition from intents and comparable claims, each tagged with its qualified name, source and authority.
3. **Run the queries** of the Semantic contract, section 4, in this order: Q-STATE, Q-VAC, Q-FEAS, Q-EX, Q-PRES, Q-MEET.
4. **Minimise** every failing query to its minimal conflicting sets (section 4).
5. **Build the gap view** (section 5).
6. **Write the report** (section 6).

By default every fragment is in the pool whatever its authority, so that a candidate's consequences are visible before approval. Findings record the authority of each member. The gate uses only findings whose members are all approved.

## 2. Comparability

Two fragments are comparable when every vocabulary term they share resolves to the same declaration with the same digest. Version 1 has one vocabulary per model, so comparability fails only when a lifted claim uses a term with a different type or unit, or a term the vocabulary lacks.

| Situation | Outcome |
| --- | --- |
| Claim uses a known term with the declared type and unit | Comparable |
| Claim uses a known term with a different unit or type | Not comparable, reason unit-mismatch or type-mismatch |
| Claim uses a term the vocabulary lacks | Unliftable, reason unknown-term; listed in the gap view |

Not-comparable claims never appear in a conflict (CSH-021).

## 3. Encoding for the solver

The pinned solver is Z3 with linear integer arithmetic (D15).

| Model element | Encoding |
| --- | --- |
| `int` field, argument or literal | An integer constant or numeral; units are already erased |
| `bool` | A boolean constant |
| Enumeration | An integer constant with an added range constraint, one value per member in canonical member order |
| `now` reference applied at a state | The constant for that field at that state |
| `pre`, `post` | Two sets of constants per state: `Account.balance@pre`, `Account.balance@post` |
| `arg`, `result` | One constant each per event |
| Each pool fragment | One assertion, tracked under its qualified name so that it can appear in an unsatisfiable core |

Q-FEAS contains a universal quantifier over the post-state and result. It is sent as a quantified formula; the fragment remains decidable because the arithmetic is linear. If the solver answers unknown, the result is unknown and the report says so.

Each query has a time budget, 5,000 ms by default and set in configuration. Exceeding it yields unknown with reason solver-timeout. The solver version and the budget are recorded in the report.

## 4. Minimal conflicting sets

A conflicting set is minimal when removing any one member makes the remainder satisfiable.

1. Ask the solver for an unsatisfiable core of the tracked assertions.
2. Shrink it by deletion: remove one member at a time and re-check; keep the removal if the set is still unsatisfiable.
3. Assumptions are never removed. They are reported as the context of the conflict, since a conflict that exists only under an assumption is information the owner needs.
4. To find further sets, block the one found (require at least one of its members to be absent) and repeat, up to a limit of 16 sets per query. If the limit is reached, the report says the list is incomplete.

For Q-FEAS the same procedure runs over the requirements and invariants in the quantified body, re-asking the quantified query for each trial subset. The solver's model supplies the input for which no outcome exists, and that input is printed with the finding.

For Q-PRES and Q-MEET nothing is minimised: the finding is the pair (transition, obligation) and the counterexample step.

### 4.1 Finding kinds

| Kind | From | Members | Carries |
| --- | --- | --- | --- |
| state-conflict | Q-STATE | Invariants | Minimal set |
| vacuous | Q-VAC | One requirement | The assumptions and invariants that exclude its trigger |
| joint-conflict | Q-FEAS | Requirements and invariants | Minimal set and the input with no valid outcome |
| example-conflict | Q-EX | One example plus obligations | Minimal set |
| not-preserved | Q-PRES | One transition, one invariant | Counterexample step |
| not-met | Q-MEET | One transition, one requirement | Counterexample step |
| unknown | Any | The query's fragments | Reason |

A finding whose members come from more than one source is flagged cross-source. Those are the findings the tool exists for.

### 4.2 Collision terms

For each conflict the report lists the vocabulary terms referenced by at least two members. They tell the reader where to look, for example `Account.balance@post` and `Withdraw.result`.

### 4.3 The three readings

Every conflict finding prints the same three options and chooses none (main tab, section 6.5): a member is wrong; a context is missing; the intent is undecided. The harness never proposes which.

## 5. Gap view

The gap view is a table with one row per subject and one column per source, where the intent blocks count as one source named `intent`.

**Rows:** every state field, every event, every event argument and result, and every obligation.

**Cell values:**

| Value | Meaning |
| --- | --- |
| asserts | The source holds an invariant or requirement that references the subject |
| exemplifies | The source holds an example that references the subject |
| models | A transition constrains the subject |
| unliftable | The source has content about the subject that could not be lifted |
| silent | None of the above |

**Derived gaps**, each listed under the table with the fragments involved:

| Gap | Condition |
| --- | --- |
| unconstrained-after | A field is not constrained in the post-state on some branch of a transition (P10) |
| no-example | A requirement has no example on which its trigger is true |
| no-rule | An example's event has no requirement whose trigger the example meets |
| single-source | An obligation's subject is asserted by exactly one source |
| uncited | A source item with an identifier has no fragment citing it (see the Evidence tab) |
| unbound | A term referenced by an approved obligation has no binding |
| reserved | An `architecture` or `temporal` obligation that version 1 cannot evaluate |

unconstrained-after is decided by a query: for each field f and each branch, is there a pair of post-states that differ only in f and both satisfy the branch? If so, f is unconstrained there.

A gap is not a failure. The view states what is absent so a person can decide whether it matters.

## 6. Report (`csh-report/v1`)

```ts
interface Report {
  schema: "csh-report/v1";
  moduleDigest: string;
  snapshot?: { commit: string; ledgerHead: string };   // present from stage 7
  tool: { version: string; solver: string; budgetMs: number };
  findings: Finding[];
  notComparable: { fragment: string; source: string; reason: string }[];
  gapView: {
    sources: string[];
    rows: { subject: string; cells: Record<string, Cell> }[];
    gaps: { kind: string; subject: string; fragments: string[]; detail?: string }[];
  };
  assessments?: Assessment[];                           // present from stage 6
}

type Cell = "asserts" | "exemplifies" | "models" | "unliftable" | "silent";

interface Finding {
  id: string;                    // stable: hash of kind and sorted member names
  kind: "state-conflict" | "vacuous" | "joint-conflict" | "example-conflict"
      | "not-preserved" | "not-met" | "unknown";
  scope: "specification" | "implementation";
  members: { fragment: string; source: string; authority: string; digest: string }[];
  context: string[];             // assumptions in force
  crossSource: boolean;
  collisionTerms: string[];
  witness?: Record<string, string>;   // term -> value, integers as decimal strings
  reason?: string;               // for unknown
  incomplete?: boolean;          // minimal-set limit reached
}
```

The human-readable report is generated from this JSON and nothing else. It leads with cross-source conflicts, then other conflicts, then failed preservation, then unknowns, then the gap view. It prints counts only after the findings, and never a single score.

## 7. Commands

| Command | Does | Exit status |
| --- | --- | --- |
| `csl emit <file>` | Emits the model and digest | Non-zero on any rule or error |
| `csl print <model>` | Prints canonical TypeScript | Zero |
| `csh check <model>` | Runs sections 1 to 6, writes the report | Zero when the run completed, whatever it found |
| `csh gaps <model>` | Prints the gap view only | Zero |
| `csh explain <finding-id>` | Prints one finding with members rendered through the printer | Zero |

`csh check` reports and does not judge. Blocking is the gate's job (Authority tab), so a completed run exits zero even with conflicts.

## 8. Fixtures this tab must reproduce

F10 to F16 and F20 to F24 from the Semantic contract. In particular: F15 returns exactly two minimal sets; F21 returns one joint conflict with an input in the overlap; F22 returns none; F16 returns only unknowns.
