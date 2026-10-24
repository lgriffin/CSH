import pytest

from shop.cart import discount, total


def test_total(snapshot):
    assert total([(2, 3)]) == snapshot
    assert total([]) == snapshot


class TestDiscount:
    @pytest.mark.parametrize("code", ["TENOFF"])
    def test_ten_off(self, snapshot, code):
        assert discount(100, code) == snapshot
