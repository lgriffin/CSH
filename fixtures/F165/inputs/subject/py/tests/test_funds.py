from limits.funds import withdraw


def test_GRN_2_withdraws_within_the_balance():
    balance = 100
    assert withdraw(balance, 0, 40) == 60
