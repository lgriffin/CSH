import pytest

from shop.orders import total


def test_REQ_1_total_sums_lines():
    assert total([1, 2]) == 3


def test_REQ_2_rejects_negative_lines():
    with pytest.raises(ValueError):
        total([-1])


class TestRefunds:
    @pytest.mark.skip(reason="refunds are not built yet")
    def test_REQ_3_full_refund(self):
        assert False


@pytest.fixture
def database():
    raise ConnectionError("no database")


def test_REQ_4_saves_the_order(database):
    assert database
