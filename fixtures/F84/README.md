# F84

The executions file records two passing tests. Only one of them, `accepts the correct password`, recorded a witness.
The other, `counts a wrong password`, ran and said nothing to the harness: it is reported as the gap
`unobserved-test`, with its source and the test's identity as its subject (`UnitTests/test/signin.test.ts::counts a wrong password`). Anchor, harnesses and A3, section 3.2
([09](../../docs/spec/09-anchor-harness-a3.md)); exit of stage 11.
