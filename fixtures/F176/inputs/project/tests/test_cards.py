from board.domain.cards import move


def test_REQ_1_keeps_a_card_that_moves():
    assert move(["a"], "a") == 0


def test_REQ_2_the_domain_answers_alone():
    assert move([], "a") != 0
