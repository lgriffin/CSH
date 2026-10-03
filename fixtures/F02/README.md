# F02

The invariant body uses a post-state reference, captured from the transition callback. An invariant body accepts only
`now` references, so the builder's phase types reject it at compile time (rule S3). Semantic contract, section 7.1;
phase table in section 2.2.
