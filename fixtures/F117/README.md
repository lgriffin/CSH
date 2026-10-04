# F117

An agent listed in the maintainers file appends an approval to the ledger and commits it alone, signed with its own
test-only key. The entry is invalid with reason `agent-key`: an agent's key never approves. `csh status` lists it
among the invalid entries and counts the fragment as candidate. Real git repository with throwaway gpg keys generated
by the test. Next layers, sections 6.1 and 9; Authority tab, section 3.1; exit of stage 20.

The fixture is written before the code of its stage, from [10](../../docs/spec/10-next-layers.md); the runner reports it as pending until that stage is built.
