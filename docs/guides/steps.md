# Writing a step table

`@csh/adapter-gherkin` reads Gherkin scenarios and lifts each one as an example claim. It knows no phrases of its own.
Your project's step table says what each step sets, the job Cucumber's step definitions do.

## 1. Write `csh/steps.ts`

```ts
import type { StepDefinition } from "@csh/adapter-gherkin";

export const steps: StepDefinition[] = [
  { keyword: "Given", pattern: /^the account has (\d+) failed attempts?$/,
    effects: (m) => [{ part: "pre", key: "failedAttempts", value: { k: "int", v: m[1]!, unit: "count(attempts)" } }] },
  { keyword: "When", pattern: /^the user signs in with the (correct|wrong) password$/,
    effects: (m) => [{ part: "args", key: "passwordOk", value: { k: "bool", v: m[1] === "correct" } }] },
  { keyword: "Then", pattern: /^the sign-in is (accepted|refused)$/,
    effects: (m) => [{ part: "result", key: "result", value: { k: "enum", member: m[1] === "accepted" ? "Accepted" : "Refused" } }] },
];

// Needed only when the vocabulary declares more than one event.
export const event = "SignIn";
```

- `part` is where the value goes: the state before (`pre`), an argument (`args`), the state after (`post`) or the
  result.
- `key` is a witness key, the same one a binding names (`s.bind(Login.failures, "failedAttempts")`). The adapter
  lifts it to the model term through the bindings, exactly as it does for a unit test's witness.
- A quantity carries the unit the scenario wrote. If a scenario says minutes and the model counts seconds, record the
  conversion in the source's `units.json` (`{ "time(min)": { "to": "time(s)", "factor": 60 } }`), where it is
  reviewed as a decision. Otherwise the scenario is reported as not comparable.
- The file runs inside the adapter's sandbox, which can read this one file of your project. Import types only.

## 2. Name it in the manifest

```json
{ "id": "bdd", "name": "BDD", "kind": "scenarios", "sources": ["Scenarios"],
  "adapter": "@csh/adapter-gherkin", "steps": "csh/steps.ts", "cites": "Product" }
```

`cites` names the source whose identifiers a tag such as `@LCK-001` refers to.

## 3. Read what was lifted

A scenario with a step the table does not know is kept whole as unliftable, with reason `unknown-step` and the line of
that step. It is never dropped and never lifted in part. `csh run` lists it among the gaps, so an unknown step shows up
as work to do, not as silence.
