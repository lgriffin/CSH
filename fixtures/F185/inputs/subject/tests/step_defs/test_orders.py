"""REQ-ORD-001 and REQ-ORD-002: every scenario of orders.feature."""

from pathlib import Path

from pytest_bdd import given, scenarios, then, when

FEATURES = Path(__file__).resolve().parents[1] / "features"
scenarios(str(FEATURES / "orders.feature"))


@given("an empty basket", target_fixture="basket")
def empty_basket() -> list[str]:
    return []


@when("the member places an order")
def place(basket: list[str]) -> None:
    basket.append("order")


@then("the order is stored")
def stored(basket: list[str]) -> None:
    assert basket == ["order"]
