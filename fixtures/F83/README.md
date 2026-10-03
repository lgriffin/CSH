# F83

Two version 2 witnesses carry no outcome, and the executions file has a line only for the test that recorded `w2`.
`w1` has no execution line, so its outcome is unknown: it is reported as an execution with outcome unknown, it is not
lifted as a claim, and the gap `outcome-unknown` names its test. A record with no outcome is never treated as
passed. Anchor, harnesses and A3, sections 3.2 and 6.3 ([09](../../docs/spec/09-anchor-harness-a3.md)); exit of
stage 11.
