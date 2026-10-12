from enum import Enum


class Code(Enum):
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"


STATUS: dict[Code, int] = {
    Code.NOT_FOUND: 404,
    Code.CONFLICT: 409,
}
