//! Orders and prices.
use shop_db::ORDERS_TABLE;

pub struct Order {
    pub table: &'static str,
}

pub fn new_order() -> Order {
    Order { table: ORDERS_TABLE }
}
