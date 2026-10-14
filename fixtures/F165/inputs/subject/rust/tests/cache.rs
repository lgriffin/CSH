use cache::Cache;

#[test]
#[allow(non_snake_case)]
fn GRN_5_evicts_at_capacity() {
    let capacity = 1;
    let mut cache = Cache::new(capacity);
    cache.insert(1);
    cache.insert(2);
    assert_eq!(cache.entries, vec![2]);
}
