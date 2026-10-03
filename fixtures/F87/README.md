# F87

Two examples on `SignIn`, one from `Scenarios` and one from `UnitTests`, state every field and argument with the same
values, and their outcomes cannot both hold: one says the account locks, the other that it does not. No requirement
sits between them, so before stage 13 nothing reports them. The new query finds an `example-divergence` between the
two, with inputs `identical`. It is a divergence and not a conflict: the specification does not say the event gives
one outcome for one input. Anchor, harnesses and A3, section 6.1 ([09](../../docs/spec/09-anchor-harness-a3.md));
exit of stage 13.
