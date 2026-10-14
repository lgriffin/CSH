def withdraw(balance: int, floor: int, amount: int) -> int:
    if balance - amount < floor:
        raise ValueError("below the floor")
    return balance - amount
