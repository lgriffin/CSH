# F80

The component manifest's `tdd` practice names two sources, `UnitTests` and `IntegrationTests`. The specification
declares no source called `IntegrationTests`. A practice naming a source that does not exist is an error: the
manifest is refused with `practice-unknown-source`, and nothing is evaluated. Anchor, harnesses and A3, section 2.1
([09](../../docs/spec/09-anchor-harness-a3.md)); exit of stage 10.
