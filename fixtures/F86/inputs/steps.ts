// The project's step table for F86: each phrase, by keyword, to the witness keys it sets. It is the project's own
// code, loaded by @csh/adapter-gherkin inside the adapter's sandbox.
type Value = { k: "int"; v: string; unit?: string } | { k: "bool"; v: boolean } | { k: "enum"; member: string };
type Effect = { part: "pre" | "args" | "post" | "result"; key: string; value: Value };

export const steps: { keyword: "Given" | "When" | "Then"; pattern: RegExp; effects: (m: RegExpExecArray) => Effect[] }[] = [
  { keyword: "Given", pattern: /^the account has (\d+) failed attempts?$/, effects: (m) => [{ part: "pre", key: "failedAttempts", value: { k: "int", v: m[1]!, unit: "count(attempts)" } }] },
  { keyword: "Given", pattern: /^the account is (not )?locked$/, effects: (m) => [{ part: "pre", key: "locked", value: { k: "bool", v: m[1] === undefined } }] },
  { keyword: "When", pattern: /^the user signs in with the (correct|wrong) password$/, effects: (m) => [{ part: "args", key: "passwordOk", value: { k: "bool", v: m[1] === "correct" } }] },
  { keyword: "Then", pattern: /^the sign-in is (accepted|refused)$/, effects: (m) => [{ part: "result", key: "result", value: { k: "enum", member: m[1] === "accepted" ? "Accepted" : "Refused" } }] },
  { keyword: "Then", pattern: /^the account is (not )?locked$/, effects: (m) => [{ part: "post", key: "locked", value: { k: "bool", v: m[1] === undefined } }] },
];
