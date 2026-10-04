# F116

The candidate queue of the shop component, with its limit set to 2 in \`csh/config.json\`. Nothing is approved, so the
queue holds both rules and both bindings. Each binding unlocks both rules, since each rule needs every term it
constrains bound and approved; each rule unlocks only its own verdict. The queue is ordered by what each entry unlocks,
then by age, then by name, so the two bindings come first. It holds more than its limit and prints a warning that the scope should
narrow. Next layers, sections 6.4 and 9; exit of stage 20.

The fixture is written before the code of its stage, from [10](../../docs/spec/10-next-layers.md); the runner reports it as pending until that stage is built.
