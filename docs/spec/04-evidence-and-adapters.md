# Evidence and adapters

This tab specifies how existing practice gets into the harness: the witness format for executions, the contract every adapter obeys, the two reference adapters, and how a witness is judged against an obligation. It covers stages 4 and 6 of the path. Everything here is proposed and unimplemented.

## 1. Two things an input can give

|  | Claim | Witness |
| --- | --- | --- |
| What it is | Something a source asserts should be true | A record of something that happened |
| Form in the model | An invariant, requirement or example in a `claims` block | A `csh-witness/v1` record, outside the model |
| Used by | Joint evaluation and the gap view | Verdicts on approved obligations |
| Authority | Candidate until approved | None; it is evidence |

A passing test gives both: its expectation is a claim (the test author asserts this outcome is right), and its execution is a witness (this outcome occurred).

## 2. Witness format (`csh-witness/v1`)

Witnesses are stored one JSON object per line.

```ts
interface Witness {
  schema: "csh-witness/v1";
  id: string;                         // unique within the file
  event: string;                      // event name in the vocabulary
  args: Record<string, Json>;         // by bound key
  pre: Record<string, Json>;          // by bound key
  post: Record<string, Json>;         // by bound key
  result?: Json;
  execution: {
    test?: string;                    // test identity, free text
    localResult: "passed" | "failed" | "errored";
    mocked: string[];                 // names of states or collaborators replaced by test doubles
  };
  subject: { commit: string; buildDigest?: string; environment: string };
  tool: { id: string; version: string; configDigest?: string };
  recordedAt: string;                 // ISO 8601, informational only
}
type Json = string | number | boolean | null;
```

Rules for values:

- An integer is a JSON number that is a safe integer, or a decimal string for larger values. A non-integer number makes the witness inapplicable, reason value-not-integer.
- An enumeration value is a string equal to a member name. Any other string is inapplicable, reason value-unmapped.
- `localResult` is stored and reported, and never enters a verdict (P2).
- `recordedAt` never enters a verdict or a digest.

## 3. Judging a witness against an obligation

For an approved obligation O and a witness w:

1. **Event.** For a requirement, w's event must be O's event. For an invariant, w's event must act on the invariant's state. Otherwise inapplicable, reason event-mismatch.
2. **Bindings.** Collect every term O references. Each needs an approved binding, else inapplicable, reason binding-not-approved.
3. **Keys.** Each bound key must be present in the right part of w (`pre`, `post`, `args`, `result`), else inapplicable, reason key-missing.
4. **Policy rejections.** If the policy rejects MockOnly and `mocked` names the obligation's state, inapplicable, reason evidence-rejected.
5. **Freshness.** Compare the dependency digests stored with the witness against the snapshot (Authority tab). A difference makes it stale.
6. **Evaluate.** Substitute the values and evaluate the expression exactly, with unbounded integers. An invariant is evaluated at the pre-state and at the post-state.
7. **Result.** False gives a violation with scope implementation, carrying the witness id and the substituted values. True contributes to the BoundaryWitness method when a requirement's trigger on that event is true in w.

A violated pre-state invariant is reported separately as precondition-not-met: the test began from a state the specification forbids, which is information about the test and not about the implementation.

Evaluation uses no solver. It is direct computation and is fully deterministic.

## 4. Adapter contract

An adapter turns one kind of input into claims, witnesses, or both. It runs in an isolated subprocess and never sees the ledger.

```ts
interface AdapterManifest {
  id: string;
  version: string;
  ir: "csh-ir/v1";
  produces: ("claims" | "witnesses" | "items")[];
  inputKinds: string[];               // matches Source.kind
}

interface AdapterInput {
  source: Source;                     // from the model
  vocabulary: Vocabulary;             // read-only
  bindings: Binding[];                // read-only, with authority
  files: { path: string; digest: string; bytes: Uint8Array }[];
}

interface AdapterOutput {
  claims?: ClaimSet;                  // Semantic contract, section 1
  witnesses?: Witness[];
  items?: SourceItem[];               // identified items for citation
  diagnostics: { code: string; severity: "info" | "warning" | "error"; message: string; span?: string }[];
}

interface SourceItem { id: string; text: string; span: string; textDigest: string; pattern?: string }
```

An adapter must:

- Be deterministic: the same input bytes give the same output bytes.
- Report everything it cannot lift in `claims.unliftable`, with the original text and a reason. Dropping content is a defect.
- Never emit a claim whose meaning it guessed. If a term is not in the vocabulary or bindings, the construct is unliftable with reason unknown-term.
- Attach a source span to every claim, witness and item.

The harness adds the adapter's output to the model before the checks in the Joint evaluation tab. Adapter-produced fragments are always candidate.

## 5. Reference adapter A: witness files

**Purpose:** bring in test executions from any runner, and lift each as an example claim.

**Input:** `csh-witness/v1` files. A small helper, usable inside any JavaScript or TypeScript test, writes them:

```ts
import { recordWitness } from "@csh/witness";

it("accepts the requested withdrawal", () => {
  const account = new Account({ balanceMinor: 5000, minimumBalanceMinor: 0 });
  const pre = snapshot(account);
  const result = account.withdraw(10000);
  recordWitness({
    event: "Withdraw",
    args: { amount: 10000 },
    pre, post: snapshot(account),
    result: result.status,
    mocked: [],
  });
  expect(result.status).toBe("Accepted");
});
```

The helper fills in the test identity, local result, commit and tool fields. It records what happened; it does not assert.

**Output:**

- Each record as a witness.
- Each record with local result passed also as an example claim named after the witness id: `given` from `pre`, call from `args`, and `then` stating the result and every post-state field. A passing test is the author's assertion that this outcome is right, so it is a claim and can conflict with other claims.
- Records whose values cannot be typed against the vocabulary are unliftable, with the reason from section 2.

Lifting uses bindings in reverse (key to term). A key with no binding at all makes the record unliftable, reason unknown-term. A key with a candidate binding lifts, and the claim records that it depends on a candidate binding.

Failed and errored records are witnesses only. A failing test asserts nothing the harness can use as a claim.

## 6. Reference adapter B: structured requirements

**Purpose:** bring in requirement sentences written in EARS form in Markdown, and connect them to obligations in the language.

Turning a prose sentence into a predicate is interpretation, and interpretation needs a person (P1, P10). This adapter therefore does not generate predicates. It makes the sentences into identified, citable items and checks the connection in both directions.

**Input:** Markdown files in which a requirement is a table row or list item beginning with an identifier, for example `ACC-007 WHEN a withdrawal would reduce the balance below the minimum, THE ACCOUNT SERVICE SHALL reject the withdrawal.` The identifier pattern is configured per source.

**Output:**

- One `SourceItem` per sentence: identifier, exact text, span, text digest, and the EARS pattern recognised (ubiquitous, event-driven, state-driven, unwanted-behaviour, complex, optional-feature, or none).
- A diagnostic for each identified sentence that matches no pattern.
- No claims.

**What the harness then does with items and `cites`:**

| Situation | Reported as |
| --- | --- |
| An item no fragment cites | Gap: uncited |
| A fragment cites an identifier that does not exist | Error: dangling-citation |
| An item's text digest differs from the digest recorded when the citing fragment was approved | The citing fragment returns to candidate, reason source-text-changed |
| An item's EARS pattern has a `while` clause and the citing requirement has none (or the reverse, likewise for the if-clause and `and`) | Warning: shape-mismatch |

The third row is what keeps the two in step: when someone edits the sentence, the predicate that claims to express it loses its approval until a person confirms it still does. To support it, an approval entry records the text digest of each cited item (Authority tab).

## 7. What is not in version 1

- Adapters for particular test frameworks' native reports, for behaviour-driven scenario files, for interface schemas and for design documents. Each follows the contract in section 4.
- Lifting from external formal notations.
- Runtime traces. A trace adapter would emit witnesses with a declared completeness policy.
- Any adapter that uses a language model. If one is added, its output is candidate like any other and its review cost is measured.

## 8. Fixtures this tab must reproduce

F24 and F30 to F35 from the Semantic contract, plus three for adapter B:

| ID | Input | Expected |
| --- | --- | --- |
| F50 | A Markdown file with ACC-007 and no fragment citing it | Gap: uncited ACC-007 |
| F51 | RejectInsufficientFunds cites ACC-007 and is approved; the sentence is then reworded | Fragment returns to candidate, reason source-text-changed |
| F52 | A fragment cites ACC-999, which does not exist | Error: dangling-citation |
