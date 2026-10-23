"""Refunds, one scenario at a time."""

from pathlib import Path

from pytest_bdd import given, scenario, then, when

FEATURE = Path(__file__).resolve().parents[1] / "features" / "refunds.feature"


@scenario(
    str(FEATURE),
    "REQ-REF-001 An officer approves "
    "a refund",
)
def test_refund_approved() -> None:
    pass


@given("a stored order", target_fixture="order")
def stored_order() -> dict[str, object]:
    return {"refunds": []}


@when("an officer approves a refund")
def approve(order: dict[str, list[str]]) -> None:
    order["refunds"].append("approved")


@when("an officer denies a refund")
def deny(order: dict[str, list[str]]) -> None:
    pass


@then("the refund is recorded")
def recorded(order: dict[str, list[str]]) -> None:
    assert order["refunds"] == ["approved"]


@then("no refund is recorded")
def none_recorded(order: dict[str, list[str]]) -> None:
    assert order["refunds"] == []
