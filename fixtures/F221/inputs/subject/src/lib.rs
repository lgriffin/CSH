/// Renders an order count.
pub fn render(n: u32) -> String {
    format!("{n} orders")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_basic() {
        insta::assert_snapshot!(render(1));
    }

    #[test]
    fn named() {
        insta::assert_snapshot!("custom_name", render(2));
    }
}
