# F185

pytest-bdd bindings and what they decide ([18](../../docs/spec/18-from-the-toads-run.md), section 2; stage 62).

- `tests/step_defs/test_orders.py` binds every scenario of `orders.feature` with `scenarios()`. REQ-ORD-002 has no
  steps, so its test passes having checked nothing: a `stepless-scenario` gap. REQ-ORD-001 is bound and its steps are
  defined: no signal.
- `tests/step_defs/test_refunds.py` binds REQ-REF-001 by its title, written as two adjacent literals. REQ-REF-002 has
  steps, all of them defined, and no test binds it, so they never run: an `unbound-scenario` gap. REQ-REF-003 has no
  steps and no test binds it: an `unbound-scenario` gap that says so.
- `tests/step_defs/test_accounts.py` binds through `_bind`, a helper that computes the title. Which scenarios of
  `accounts.feature` it binds cannot be read, so both are `binding-undecided`, naming the file.
- `tests/step_defs/test_shipping.py` binds `shipping.feature` in a loop over its base name: REQ-SHP-001 is bound.
- No step-definition file is said to declare no test.

Run with pytest and pytest-bdd 8.1, the collection binds REQ-ORD-001, REQ-ORD-002, REQ-REF-001, REQ-ACC-001 and
REQ-SHP-001, and leaves out REQ-REF-002, REQ-REF-003 and REQ-ACC-002.

The expected result was written from the specification before the code.
