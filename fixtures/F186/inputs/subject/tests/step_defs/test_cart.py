"""REQ-CART-001 to REQ-CART-003."""

from pathlib import Path

from pytest_bdd import given, parsers, scenarios, when
from pytest_bdd import then as expect

scenarios(str(Path(__file__).resolve().parents[1] / "features" / "cart.feature"))


@given(parsers.parse("a basket holding {count:d} items"), target_fixture="basket")
def basket(count: int) -> list[str]:
    return ["item"] * count


@when(parsers.re(r'the member adds "(?P<item>[^"]+)"'))
def add(basket: list[str], item: str) -> None:
    basket.append(item)


@when(
    "the member empties "
    "the basket"
)
def empty(basket: list[str]) -> None:
    basket.clear()


@expect(parsers.cfparse('the basket holds {count:d} items and "{item}" is the last'))
def holds(basket: list[str], count: int, item: str) -> None:
    assert len(basket) == count and basket[-1] == item


@expect(parsers.re(r"the basket is empty"))
def is_empty(basket: list[str]) -> None:
    assert basket == []


@expect("the basket is gone")
def gone() -> None:
    pass
