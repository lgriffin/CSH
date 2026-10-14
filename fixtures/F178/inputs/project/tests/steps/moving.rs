use cucumber::{given, then, when, World};

#[derive(Debug, Default, World)]
pub struct Board {
    cards: usize,
}

#[given(expr = "a board with {int} cards")]
fn a_board_with(board: &mut Board, cards: usize) {
    board.cards = cards;
}

#[when(regex = r"^a card moves to (\w+)$")]
fn a_card_moves_to(_board: &mut Board, _column: String) {}

#[then("the board holds 3 cards")]
fn the_board_holds(board: &mut Board) {
    assert_eq!(board.cards, 3);
}
