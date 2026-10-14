pub struct Cache {
    pub capacity: usize,
    pub ttl: u64,
    pub entries: Vec<u64>,
}

impl Cache {
    pub fn new(capacity: usize) -> Self {
        Cache { capacity, ttl: 60, entries: vec![] }
    }

    pub fn insert(&mut self, at: u64) {
        if self.entries.len() >= self.capacity {
            self.entries.remove(0);
        }
        self.entries.push(at);
    }
}
