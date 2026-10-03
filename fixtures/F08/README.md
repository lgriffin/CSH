# F08

The module reads the clock to choose a literal. The sandbox replaces `Date` with a function that throws, so emission
fails with E-ACCESS. If the clock is forced open (a test-only switch), the two emissions differ and rule S9 rejects
the module. Semantic contract, section 7.1; Language reference, section 7.
