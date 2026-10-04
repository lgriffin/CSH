# F101

The diagram draws a relation a rule forbids: `Rel(web, db)` against `WebIgnoresDb`, which forbids every package of the
`web` container from importing `db`. Each reads correctly alone; together they cannot both hold. The harness reports one
cross-source `arch-conflict` finding between the rule and the drawn relation, and the rule is `conflicting`. No solver is
involved. Next layers, section 4.3 and 9; exit of stage 18.

The fixture is written before the code of its stage, from [10](../../docs/spec/10-next-layers.md); the runner reports it as pending until that stage is built.
