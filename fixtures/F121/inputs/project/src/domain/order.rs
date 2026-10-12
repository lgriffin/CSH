use crate::adapters::sql::SqlOrderStore;

/// A customer's order.
pub struct Order {
    pub id: String,
    pub lines: Vec<u64>,
}

impl Order {
    /// The sum of the order's lines.
    pub fn total(&self) -> u64 {
        self.lines.iter().sum()
    }

    /// Stores the order.
    pub fn save(&self, store: &mut SqlOrderStore) {
        store.insert(&self.id, self.total());
    }
}
