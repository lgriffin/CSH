use crate::domain::order::Order;

/// Where orders are kept.
pub trait OrderStore {
    fn add(&mut self, order: &Order);
}
