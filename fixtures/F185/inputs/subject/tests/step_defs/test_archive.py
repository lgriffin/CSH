"""The archive, bound by its directory: pytest-bdd collects every feature file under it."""

from pytest_bdd import given, scenarios, then

scenarios("../features/archive")


@given("an archived order", target_fixture="order")
def archived() -> dict[str, bool]:
    return {"kept": True}


@then("the order is kept")
def kept(order: dict[str, bool]) -> None:
    assert order["kept"]
