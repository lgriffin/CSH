from tally.count import break_tie, count_votes


def test_counts_each_name():
    assert count_votes(["a", "b", "a"]) == {"a": 2, "b": 1}


def test_ties_go_to_the_first_name():
    assert break_tie(["b", "a"]) == "a"
