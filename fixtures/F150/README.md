# F150

Rungs on told rules ([15](../../docs/spec/15-assertion-ladder.md), section 3; stage 47). A small own component (no
subject) states six rules as headings in `docs/requirements.md` and two EARS sentences in `docs/ears.md`.

- `R-A-1` is told and nothing checks it: L2, and still the gap `unverified`.
- `R-A-2` is cited by the title of a test in `tests/a.test.ts`: L3, by that test file.
- `R-A-3` names `tests/b.test.ts` under "Verified by", which no test title cites it from: L3, by verified-by.
- `R-A-4` is cited by the architecture rule `DomainImportsNoApi`, which the stand-in approves: L4.
- `R-A-5` is cited by the architecture rule `ApiImportsNoTests`, a candidate: a candidate never raises a rung, so
  `R-A-5` stays L2 and is still `unverified`.
- `R-A-6` is cited by a test title and by the approved rule `DomainImportsNoTests`: L4, with the test file listed as
  an L3 mechanism beside it.
- `EARS-1` is cited by the approved rule `DomainImportsNoApi`: L4. `EARS-2` is cited by nothing: L2.

So the ladder counts are three at L2, two at L3, three at L4 and none at L5. Every rule also lands in the outcome it
landed in before: the rung adds an axis and moves nothing.

The expected result was written from the documents before the fixture was first run.
