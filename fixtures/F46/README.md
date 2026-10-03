# F46

Everything is approved; the unit of `balance` then changes (minor to cent). Every fragment whose digest covers the
balance declaration returns to candidate, because a fragment's digest includes the digests of the declarations it
references (Semantic contract, section 5, rule 4). The fixture changes the unit everywhere, since a mixed unit would not
compile. Semantic contract, section 7.5.
