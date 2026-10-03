# F89

As F87, with the event declared `deterministic: true`, an elevated assumption that the event gives one outcome for one
input. Two examples with identical inputs and outcomes that cannot both hold now contradict each other: the finding is
an `example-conflict` between the two examples, and no divergence is reported. Anchor, harnesses and A3, section 6.1
([09](../../docs/spec/09-anchor-harness-a3.md)); exit of stage 13. The specification uses `deterministic`, which the
language gains in stage 13, so `tsconfig.fixtures.json` leaves this fixture out until then.
