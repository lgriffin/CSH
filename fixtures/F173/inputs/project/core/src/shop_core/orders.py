"""Orders and prices."""
from shop_db.tables import ORDERS_TABLE


def new_order() -> dict:
    return {"table": ORDERS_TABLE}
