# F229

False refutations and false unverified rules found by labelling ESI.ts ([22](../../docs/spec/22-analysis-a3-and-1.0.md),
section 4; stage 79). Each sentence of `docs/guide.md` names a path:

- `src/adapters/PipelineTransport` is a module written without its extension, and `PipelineTransport.ts` exists (A-278).
- `docs/OLD-GUIDE.md` is the former guide, folded into this one (A-279).
- `site/dist` is build output the repository ignores as `site/dist/` (A-282).
- `src/require.cts` is written from `tests/consumer`, where it exists (A-281).
- `src/core/retry.ts` does not exist: the one dangling reference, refuted.
- A relative link, `../site/dist`, to the same ignored directory is not dangling either (A-282).

In `docs/architecture.md`, the rule on line 3 names its own check, `pnpm lint:layers`, a script of the package (A-280),
so it is not unverified; the rule on line 5 names none and is. Lines 7 and 8 are a dated record and a plan's step, so
neither is lifted (A-283). The rule on line 10 names `pnpm dev`, a script that checks nothing, so it
stays unverified (A-280).

The expected result was written from the specification before the code existed.
