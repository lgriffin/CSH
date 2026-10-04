# F99

A gate decision is stored in `reports/csh-gate.json` for a snapshot other than the current one, as after a commit that
was never run. `csh status` shows the stored decision as out of date, with the snapshot it is for, and never as the
current decision. Next layers, sections 3.2 and 9; exit of stage 17.

The fixture is written before the code of its stage, from [10](../../docs/spec/10-next-layers.md); the runner reports it as pending until that stage is built.
