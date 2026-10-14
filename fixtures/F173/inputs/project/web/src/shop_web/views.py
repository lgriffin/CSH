"""Pages and the API."""
from shop_core.orders import new_order


def show() -> dict:
    return new_order()
