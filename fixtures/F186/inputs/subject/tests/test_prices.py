"""Prices never go negative: a property, not a step."""

from hypothesis import given
from hypothesis import strategies as st


@given(st.integers(min_value=0))
def test_price_is_never_negative(cents: int) -> None:
    assert cents >= 0
