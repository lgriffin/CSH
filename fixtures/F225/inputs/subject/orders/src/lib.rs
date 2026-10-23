/// Reads an order line such as "2 tea".
pub fn parse_order(line: &str) -> Option<(u32, String)> {
    let (n, item) = line.split_once(' ')?;
    Some((n.parse().ok()?, item.to_string()))
}
