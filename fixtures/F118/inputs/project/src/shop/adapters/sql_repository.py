import sqlite3

from shop.domain.order import Order
from .connection import connect


class SqlOrderRepository:
    def add(self, order: Order) -> None:
        connect().execute("insert into orders values (?, ?)", (order.id, order.total))
