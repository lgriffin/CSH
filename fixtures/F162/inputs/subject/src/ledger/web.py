from ledger.db import Store
from ledger.domain import Entry, post


def handle(store: Store, account: str, cents: int) -> int:
    entry = Entry(account, cents)
    post(store.rows, entry)
    store.save(entry)
    return 201
