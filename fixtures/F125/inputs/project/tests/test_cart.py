import pytest


@pytest.fixture
def cart():
    return []


def test_REQ_1_adds_an_item(cart):
    cart.append(1)
    assert cart == [1]


@pytest.mark.parametrize("qty", [1, 2, 3], ids=["one", "REQ-2 two", "three"])
def test_quantity(qty):
    assert qty > 0


class TestCheckout:
    def test_totals(self):
        """REQ-3: the total is the sum of the lines.

        REQ-8 is named only past the first line.
        """
        assert sum([1, 2]) == 3


class TestNotCollected:
    __test__ = False

    def test_REQ_9_never_collected(self):
        pass


def helper_REQ_7():
    return None
