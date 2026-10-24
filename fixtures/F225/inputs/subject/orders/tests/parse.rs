use orders::parse_order;

#[test]
fn reads_a_count_and_an_item() {
    assert_eq!(parse_order("2 tea"), Some((2, "tea".to_string())));
}
