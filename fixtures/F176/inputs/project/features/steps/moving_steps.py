from behave import given, then, when


@given("a board with {count:d} cards")
def a_board_with(context, count):
    context.cards = ["card"] * count


@when("a card moves to {column}")
def a_card_moves_to(context, column):
    context.column = column


@then("the board holds {count:d} cards")
def the_board_holds(context, count):
    assert len(context.cards) == count
