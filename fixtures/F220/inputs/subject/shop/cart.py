def total(lines):
    return sum(price * quantity for price, quantity in lines)


def discount(amount, code):
    return amount * 0.9 if code == "TENOFF" else amount
