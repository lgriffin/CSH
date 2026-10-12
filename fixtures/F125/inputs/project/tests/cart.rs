use rstest::rstest;
use shop::cart::Cart;

/// REQ-1: adding an item puts it in the cart.
#[test]
fn adds_an_item() {
    assert_eq!(Cart::default().add(1).len(), 1);
}

#[tokio::test]
async fn saves_the_cart_REQ_2() {
    Cart::default().save().await;
}

#[rstest]
#[case(1)]
#[case(2)]
fn accepts_positive_REQ_3(#[case] qty: u32) {
    assert!(Cart::default().accepts(qty));
}

fn empty_cart_REQ_9() -> Cart {
    Cart::default()
}
