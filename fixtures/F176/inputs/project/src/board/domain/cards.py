"""Cards by column."""
from board.http.status import NOT_FOUND


def move(cards: list[str], card: str) -> int:
    return 0 if card in cards else NOT_FOUND
