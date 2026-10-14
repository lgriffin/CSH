from dataclasses import dataclass


@dataclass(frozen=True)
class Entry:
    account: str
    cents: int


def post(entries: list[Entry], entry: Entry) -> list[Entry]:
    return [*entries, entry]
