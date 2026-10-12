from typing import Protocol

from ..domain.order import Order


class OrderRepository(Protocol):
    def add(self, order: Order) -> None: ...
