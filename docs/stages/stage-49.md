# Stage 49: Prevention

**Exit:** F151 to F154. The structural claim `total(module, symbol, over)` holds, is refuted or is unknown from facts
alone, in every language CSH reads ([15](../spec/15-assertion-ladder.md), section 4).

**Status:** exit reached.

| Language | Fixture | Closed type | Complete mapping | Result |
| --- | --- | --- | --- | --- |
| TypeScript | F151 | literal union, `enum` | `Record<K, V>`, `Readonly<...>`, `satisfies` | holds or refuted |
| Java | F152 | `enum`, `sealed` type | a `switch` with no `default` | holds or refuted |
| Rust | F153 | `enum` | a `match` with no catch-all | holds or refuted |
| Python, Go | F154 | none | none | unknown, with the reason |

## Built

- `kernel`: the prop `total`; `csl`: `total(...)`.
- `witness` and `facts`: optional `members` and `total` on a `declare` fact, so `csh-facts/v2` keeps its shape.
- `facts-ts`, `facts-code` (Java and Rust): both fields, read from the syntax tree; nothing is compiled.
- `arch`: `total` judged by lookup, with the compiler named in the detail.
- [A-177](../../ASSUMPTIONS.md) to [A-181](../../ASSUMPTIONS.md).

## What the fixtures revealed

- Cross-language compliance needed one rule stated three ways, and the fixtures were written first for each: what
  makes a mapping complete in TypeScript is its type, in Java and Rust it is the absence of a fallback arm. A `default`
  or `_` arm is the one thing that turns a held claim into a refuted one, and each fixture has that case.
- Python and Go are not refuted, which would say the code is wrong; they are unknown, which says the language has no
  such compiler. Python's taskboard receiver catches the same mistake with an architecture rule instead.

## Not done

- TypeScript exhaustive `switch` through `never`, and type checkers for Python ([Q-46](../../QUESTIONS.md)).
