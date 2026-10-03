// The lockout example's step table (Anchor, harnesses and A3, section 3.3): each phrase the scenarios use, by keyword,
// to the witness keys it sets. It does the job Cucumber's step definitions do. @csh/adapter-gherkin loads it inside the
// adapter's sandbox, because the BDD practice names it in csh/component.json. A step that states a quantity keeps the
// unit the scenario wrote; a conversion is a team decision, recorded in features/units.json.
import type { StepDefinition } from "@csh/adapter-gherkin";

const UNITS: Record<string, string> = { minutes: "time(min)", minute: "time(min)", seconds: "time(s)", second: "time(s)" };

export const steps: StepDefinition[] = [
  { keyword: "Given", pattern: /^the account has (\d+) failed attempts?$/, effects: (m) => [{ part: "pre", key: "failedAttempts", value: { k: "int", v: m[1]!, unit: "count(attempts)" } }] },
  { keyword: "Given", pattern: /^the account is (not )?locked$/, effects: (m) => [{ part: "pre", key: "locked", value: { k: "bool", v: m[1] === undefined } }] },
  { keyword: "When", pattern: /^the user signs in with the (correct|wrong) password$/, effects: (m) => [{ part: "args", key: "passwordOk", value: { k: "bool", v: m[1] === "correct" } }] },
  { keyword: "Then", pattern: /^the sign-in is (accepted|refused)$/, effects: (m) => [{ part: "result", key: "result", value: { k: "enum", member: m[1] === "accepted" ? "Accepted" : "Refused" } }] },
  { keyword: "Then", pattern: /^the account is (not )?locked$/, effects: (m) => [{ part: "post", key: "locked", value: { k: "bool", v: m[1] === undefined } }] },
  { keyword: "Then", pattern: /^the account has (\d+) failed attempts?$/, effects: (m) => [{ part: "post", key: "failedAttempts", value: { k: "int", v: m[1]!, unit: "count(attempts)" } }] },
  {
    keyword: "Then",
    pattern: /^the account is locked for (\d+) (minutes?|seconds?)$/,
    effects: (m) => [
      { part: "post", key: "locked", value: { k: "bool", v: true } },
      { part: "post", key: "lockSeconds", value: { k: "int", v: m[1]!, unit: UNITS[m[2]!]! } },
    ],
  },
];
