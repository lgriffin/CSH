"""Shipping, bound in a loop over the feature names."""

from pathlib import Path

from pytest_bdd import given, scenarios, then, when

FEATURES = Path(__file__).resolve().parents[1] / "features"
for name in ("shipping",):
    scenarios(str(FEATURES / f"{name}.feature"))


@given("a stored order", target_fixture="order")
def stored() -> dict[str, bool]:
    return {"told": False}


@when("the order ships")
def ships(order: dict[str, bool]) -> None:
    order["told"] = True


@then("the member is told")
def told(order: dict[str, bool]) -> None:
    assert order["told"]
