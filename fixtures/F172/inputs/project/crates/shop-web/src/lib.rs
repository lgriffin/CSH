//! Pages and the API.
use shop_core::new_order;

pub fn show() -> shop_core::Order {
    new_order()
}
