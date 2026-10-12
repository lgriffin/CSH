# F141

Prevention in TypeScript ([14](../../docs/spec/14-assertion-ladder.md), section 4; stage 47). `src/codes.ts` declares
three types: `Code`, a union of three string literals, and `Level`, an `enum` of two members, are closed; `Loose`, a
union of a literal and `string`, is not. `src/maps.ts` declares six constants:

- `STATUS: Record<Code, number>`: complete over `Code`, which `tsc` checks;
- `LABELS: Readonly<Record<Level, string>>`: complete over `Level`;
- `TITLES = { ... } satisfies Record<Code, string>`: complete over `Code`;
- `SOME: Partial<Record<Code, number>>`: not complete, since `Partial` lets a key be left out;
- `ANY: Record<string, number>`: keyed by no closed type;
- `LOOSE: Record<Loose, number>`: keyed by a type that is not closed.

The claims: `total(maps, STATUS, Code)`, `total(maps, LABELS, Level)` and `total(maps, TITLES, Code)` hold;
`total(maps, SOME, Code)` and `total(maps, ANY, Code)` are refuted; `total(maps, LOOSE, Loose)` is refuted, saying
`Loose` is not a closed type; `total(src/other.ts, X, Code)` is unknown, since `src/other.ts` was not read.

`R-P-1` is cited by the claim on `STATUS`, a candidate: L5, since what it establishes is the compiler. `R-P-2` is cited
by the refuted claim on `SOME`: it stays L2, and the claim is violated.

The expected result was written from the documents before the fixture was first run.
