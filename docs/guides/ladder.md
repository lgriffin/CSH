# Climbing the Assertion Ladder

[The Assertion Ladder](https://github.com/lgriffin/AI-Reference-Projects/tree/master/paper) grades how strongly a
repository asserts each of its rules. CSH reports the rung of every told rule beside the outcome its results land in
([15](../spec/15-assertion-ladder.md)). The paper's advice is to place each rule on a rung on purpose: high enough to
cover what breaking it would cost, and no higher. This guide says what CSH reads at each rung, and so what to add to move
a rule up.

## 1. See where each rule sits

```
npx csh run
npx csh ladder            # every told rule, weakest first, with what establishes its rung
npx csh ladder --json     # the same, as csh-ladder/v1
npx csh overview          # the outcome counts, then one line of rung counts
```

A told rule is a requirement, a Gherkin rule, a property, or an EARS sentence. Each gets exactly one rung, the highest
its evidence establishes. The rung is a floor: what CSH cannot see (a test's failure message, a linter's configuration)
never raises it.

## 2. From L2 Told to L3 Checked

A rule at L2 is stated and nothing checks it. It is also a gap, `unverified` or `uncited`, which says the same thing.
Any one of these makes it L3:

- a test whose file or title cites the rule's id (`it("R-WIP-1 refuses a sixth task in progress", ...)`);
- a Gherkin scenario under the rule, or one that cites it;
- a "Verified by" line under the rule naming a test file, an `npm run` script or another item, that resolves;
- an example in the specification's pool that cites it.

## 3. From L3 to L4 Explained

L4 is a check whose failure names the rule, the offender and the fix. CSH cannot read a test's failure message, so it
counts only its own: an obligation of your specification (an architecture rule, a structural claim, an invariant or a
requirement of the model) that cites the rule and that a person has [approved](authority.md). The enforcing gate stops
a change that breaks it, and its violation names the rule, the file and line, and what would close it.

A candidate obligation, and every rule in a subject profile, is CSH's reading of your repository, not your repository's
own assertion. It never raises a rung until it is approved.

## 4. From L4 to L5 Prevented

L5 means the wrong form does not compile. CSH establishes it for one shape today, a complete mapping over a closed type,
stated as a structural claim:

```ts
i.claim("ErrorStatusIsTotal", total("src/api/error-handler.ts", "STATUS_BY_CODE", "ErrorCode"),
  { cites: [{ source: Requirements, id: "R-ERR-1" }] });
```

| Language | Write the mapping as |
| --- | --- |
| TypeScript | `const STATUS_BY_CODE: Record<ErrorCode, number> = {...}` (or `satisfies Record<ErrorCode, number>`), with `ErrorCode` a union of literals or an `enum` |
| Java | a `switch` with no `default` over a `sealed` type or an `enum`, used as an expression or with patterns |
| Rust | a `match` with no `_` or binding arm over an `enum`, naming each variant |
| Python | not available: no compiler checks a mapping, so the claim is unknown (`no-compiler: python`) |
| Go | not available: Go has no closed types (`no-closed-types: go`) |

When the claim holds, the rule is L5 whoever wrote the claim, since what stops the wrong change is the compiler. When it
is refuted, it is a gap like any refuted claim: the prose names a prevention the code does not have.

In Python and Go, the nearest rung is L4: an approved architecture rule, or a test that maps every member.

## 5. Keep it from slipping

Put the expected rungs in `csh/expected.json`, and `csh expect` reports any rule whose rung changed:

```json
{ "schema": "csh-expected/v1", "rungs": { "Requirements/R-ERR-1": "L5", "Requirements/R-WIP-1": "L3" } }
```

The [taskboard profiles](../../subjects/taskboard-typescript/README.md) do this for the paper's own receivers.
