# F231

Java read as Apache Camel writes it ([22](../../docs/spec/22-analysis-a3-and-1.0.md), section 4.1; stage 81). The
`shop` module's tests are a failsafe `OrderIT` and a jqwik `OrderProperties`, and `docs/changes.md` links seven Jira
keys, more mentions than the requirements' own `SHOP` family.

- SHOP-1 is cited by `OrderIT`, a test by its root, not its name (A-289): not unverified.
- SHOP-2 is cited by a jqwik `@Property` (A-298), which writes `smove` in a string (A-293); `rounds.csv` is a file, not a
  term: neither unverified nor unobserved.
- SHOP-3 is cited by nothing: unverified.
- SHOP-4 is cited by a test that never mentions `flushAll`: unobserved-terms.
- `OrderIT`'s title cites CAMEL-11, a key of the tracker the changes link to, not an identifier the repository
  defines (A-290): no dangling citation.
- `docs/architecture.md` line 3 names `ArchitectureTest.coreIsLeaf` on the next line of its sentence: checked (A-299).
  Line 6 names no check: unverified.
- `shop/README.md` names `keystoreResource`, a field, and `sku`, a record component, which the code declares (A-300),
  and `SpecificRecord`, which it does not: undecided for that one alone.

The expected result was written from A-289, A-290, A-293 and A-298 to A-300, and fails with the stage 80 code.
