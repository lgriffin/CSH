from ledger.domain import Entry


class Store:
    def __init__(self) -> None:
        self.rows: list[Entry] = []

    def save(self, entry: Entry) -> None:
        self.rows.append(entry)
