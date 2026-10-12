use std::collections::HashMap;

use crate::domain::order::Order;
use crate::ports::OrderStore;
use crate::metrics::Counter;

/// Orders kept in a table, by id.
#[derive(Default)]
pub struct SqlOrderStore {
    rows: HashMap<String, u64>,
    added: Counter,
}

impl SqlOrderStore {
    pub fn insert(&mut self, id: &str, total: u64) {
        self.rows.insert(id.to_owned(), total);
        self.added.increment();
    }
}

impl OrderStore for SqlOrderStore {
    fn add(&mut self, order: &Order) {
        self.insert(&order.id, order.total());
    }
}
