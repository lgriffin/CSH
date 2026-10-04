# @csh/facts

## Purpose

`@csh/facts` reads the fact format, `csh-facts/v1`: one line per package and per dependency between packages, with the commit it was taken at and the file and line it came from ([10](../../docs/spec/10-next-layers.md), section 4.2). It is also the adapter for sources of kind `Facts`. A fact is evidence, like a witness: it goes stale when the code changes and never carries authority.

## Where it sits

It belongs to the "Adapters" container of the [containers diagram](../../docs/architecture/containers.mmd), with the other adapters, and is drawn in [components-facts.mmd](../../docs/architecture/components-facts.mmd) beside the command that writes facts, `@csh/facts-imports`.

## Public interface

- `adapter`, `manifest`, `readFactFiles(input)`: the adapter for `Facts` sources (id `csh.adapter.facts`, produces `facts`). It returns every fact read, and a `malformed-fact` diagnostic with its line for each line it cannot read.
- `parseFacts(text)`, `validateFact(value)`, `formatFacts(facts)`: the reader, the validator and the writer.
- `FACTS_SCHEMA` (`csh-facts/v1`), `FACTS_FILE` (`reports/facts.ndjson`).
- The types themselves, `Fact`, `PackageFact`, `DependencyFact` and `SkippedFact`, are in `@csh/witness`, beside the witness format.

## Depends on and used by

- Depends on: `@csh/kernel` and `@csh/witness` (adapter contract and fact types). No external packages.
- Used by: `@csh/facts-imports` (the writer), and `@csh/run`, which names it in `BUILTIN_ADAPTERS` and loads it inside the adapter subprocess.

## Invariants it protects

- A malformed line is reported with its line number, never dropped silently (P4).
- The adapter lifts no claim: facts reach the check engine as evidence, which decides whether they are current ([A-80](../../ASSUMPTIONS.md)).

## Rationale

The format sits beside the witness format because it is evidence of the same kind, with a subject commit and a tool ([10](../../docs/spec/10-next-layers.md), section 7). Kinds `package`, `depends` and `skipped` let the scan say what it saw, what it resolved, and what it could not.

## How it is tested

- `test/facts.test.ts`: a round trip through the writer and the reader, and a malformed line kept as a diagnostic while the rest is read.
- Fixtures F100 to F107 read their facts through this adapter.

## Known limits

- The reader checks each line's shape, not that the packages it names exist.
