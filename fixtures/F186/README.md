# F186

pytest-bdd step definitions ([18](../../docs/spec/18-from-the-toads-run.md), section 3; stage 62).

`tests/step_defs/test_cart.py` binds every scenario of `cart.feature` with `scenarios()`, and defines steps in each
form pytest-bdd reads: `parsers.parse` with a typed field, `parsers.re` with a named group, two adjacent literals,
`parsers.cfparse`, and a plain string. `then` is imported as `expect`. `tests/conftest.py` defines a step too, and
`tests/test_prices.py` uses Hypothesis's `@given`, which is no step.

- REQ-CART-002's last step, "the basket is empty for good", is matched by no definition: `parsers.re(r"the basket is
  empty")` must match the whole step. That is an `undefined-step` gap.
- "the basket is gone" is used by no scenario: an `unused-step-definition` gap.
- REQ-CART-001 and REQ-CART-003 match their definitions, the conftest one included. No step is undecided, since every
  definition is readable and Hypothesis's `@given` is not read.

Run with pytest and pytest-bdd 8.1, REQ-CART-002 fails with `StepDefinitionNotFoundError` for that step, and the rest
pass.

The expected result was written from the specification before the code.
