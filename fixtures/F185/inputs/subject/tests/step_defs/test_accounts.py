"""Accounts, bound through a helper that reads each title from the feature file."""

from pathlib import Path
from typing import Any

from pytest_bdd import given, scenario, then, when

FEATURES = Path(__file__).resolve().parents[1] / "features"


def _title(feature: str, number: int) -> str:
    prefix = f"Scenario: REQ-ACC-{number:03d} "
    line = next(x for x in (FEATURES / feature).read_text().splitlines() if prefix in x)
    return line.split("Scenario: ", 1)[1]


def _bind(feature: str, number: int) -> Any:
    return scenario(str(FEATURES / feature), _title(feature, number))


@_bind("accounts.feature", 1)
def test_signs_in() -> None:
    pass


@given("a member account", target_fixture="page")
def account() -> dict[str, str]:
    return {}


@when("the member signs in")
def signs_in(page: dict[str, str]) -> None:
    page["at"] = "their page"


@when("the member signs out")
def signs_out(page: dict[str, str]) -> None:
    page["at"] = "home"


@then("the member sees their page")
def sees_theirs(page: dict[str, str]) -> None:
    assert page["at"] == "their page"


@then("the member sees the home page")
def sees_home(page: dict[str, str]) -> None:
    assert page["at"] == "home"
