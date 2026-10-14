//! The board's stores.
pub trait Reader {}

pub trait Writer {}

pub trait Store: Reader + Writer {}

pub trait Cache: Reader {}

#[cfg(test)]
mod tests {
    #[test]
    fn store_writes_REQ_1() {}

    #[test]
    fn cache_writes_REQ_2() {}
}
