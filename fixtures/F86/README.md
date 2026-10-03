# F86

The scenario source is read by the package `@csh/adapter-gherkin`, with the project's own step table in
`inputs/steps.ts` and its citations referring to `Product`, both named in the manifest. The first scenario is lifted
as an example citing `LCK-001`. The second has a step the table does not know, `a support agent unlocks the account`:
the scenario is kept whole as unliftable with reason `unknown-step` and the span of that step. Anchor, harnesses and
A3, section 3.3 ([09](../../docs/spec/09-anchor-harness-a3.md)); exit of stage 12.
