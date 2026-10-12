from dataclasses import dataclass
from shop.adapters.sql_repository import SqlOrderRepository


@dataclass
class Order:
    id: str
    total: int

    def save(self) -> None:
        SqlOrderRepository().add(self)
