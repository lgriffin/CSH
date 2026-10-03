# Writing a probe

A probe records what a test did to the code under test, so that the harness can compare it with what the
requirements, the scenarios and the specification say. It asserts nothing. Your test keeps its own assertions.

## 1. Wrap the function once

```ts
import { probe } from "@csh/harness";
import { type Login, signIn } from "../src/lockout.ts";

const signInProbe = probe("SignIn", signIn, {
  pre: (before: Login) => ({ ...before }),
  args: (_before, passwordOk) => ({ passwordOk }),
  post: (out) => ({ ...out.login }),
  result: (out) => out.result,
  mocked: [],
});
```

- The first argument is the event's name in the specification.
- Each mapper returns witness keys and their values. A key must be one a binding names (`s.bind(Login.failures,
  "failedAttempts")`), or the witness is kept as unliftable. The mappers are the only place that names keys, so review
  them as you would a binding.
- `pre` and `args` receive the call's arguments and run before the call. `post` and `result` receive what the
  function returned, awaited for an async function, then the arguments.
- `mocked` names the states you replaced with a test double. The probe cannot tell; it records what you say.

## 2. Call it through the test

```ts
test("locks on the third failed attempt", (t) => {
  const { login, result } = signInProbe.in(t, { cites: ["LCK-001"] })({ failedAttempts: 2, locked: false, lockSeconds: 0 }, false);
  assert.equal(result, "Refused");
  assert.equal(login.locked, true);
});
```

`in(t)` reads the test's file and full name, which make its identity: `test/lockout.test.ts::locks on the third failed
attempt`. `cites` lists the requirement identifiers the test serves. The practice's `cites` setting in
`csh/component.json` says which source they belong to.

## 3. Name the reporter in the harness command

```json
"harness": {
  "run": ["node", "--test", "--test-reporter=spec", "--test-reporter-destination=stdout",
          "--test-reporter=@csh/harness/reporter", "--test-reporter-destination=stdout", "test/lockout.test.ts"],
  "witnesses": "reports/witnesses.ndjson",
  "executions": "reports/executions.ndjson"
}
```

`csh run` sets `CSH_WITNESS_FILE`, `CSH_EXECUTIONS_FILE` and `CSH_COMMIT` and runs the command. The reporter writes one
line per finished test. The witness adapter joins each witness to its test's line:

| Witness | Execution line | Result |
| --- | --- | --- |
| Present | passed | Witness, and lifted as an example claim |
| Present | failed or errored | Witness only; never a claim |
| Present | missing | Outcome unknown; never a claim; gap `outcome-unknown` |
| Missing | any | Gap `unobserved-test`: the test ran and told the harness nothing |

To run the reporter by hand and then `csh check`, name its file explicitly: `executions` on a practice without a harness,
or `executions` in `csh/config.json` for a project with no manifest. A Witnesses source whose practice names no harness
and no `executions` file is joined to none, so it never takes outcomes from another practice's tests.

Without the reporter every witness is unknown, and none becomes a claim. That is deliberate: a record cannot vouch for
its own test.
