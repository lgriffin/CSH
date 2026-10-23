def count_votes(ballots):
    return {name: ballots.count(name) for name in set(ballots)}


def break_tie(names):
    return sorted(names)[0]
