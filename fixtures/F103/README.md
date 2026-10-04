# F103

An unobserved relation: the diagram draws `Rel(web, db)`, and no import or manifest shows any package of `web`
depending on `db`. The gap `unobserved-relation` names the drawn relation and its line. A relation through a
subprocess, a pipe or a file looks the same, which is why this is a gap and not a failure. Every dependency the facts
show is drawn, so `DiagramIsComplete` holds. Next layers, sections 4.3, 4.5 and 9; exit of stage 18.

The fixture is written before the code of its stage, from [10](../../docs/spec/10-next-layers.md); the runner reports it as pending until that stage is built.
