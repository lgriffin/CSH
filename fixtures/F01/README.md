# F01

`floor` is declared in minor(USD) while `balance` is in minor(EUR). Comparing them in the invariant is a unit
mismatch, caught by the TypeScript compiler through the unit literal types (rule S2). Other uses of `floor` fail too;
the fixture requires an error on the invariant line. Defined in the Semantic contract, section 7.1, and the main tab, section 7.3.
