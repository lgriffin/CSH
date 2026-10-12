pub enum ApiError {
    NotFound(String),
    Conflict { id: String },
    Invalid,
}

pub enum Level {
    Low,
    High,
}

pub fn status(e: &ApiError) -> u16 {
    match e {
        ApiError::NotFound(_) => 404,
        ApiError::Conflict { .. } => 409,
        ApiError::Invalid => 400,
    }
}

pub fn partial(e: &ApiError) -> u16 {
    match e {
        ApiError::NotFound(_) => 404,
        _ => 500,
    }
}

pub fn named(e: &ApiError) -> u16 {
    match e {
        ApiError::NotFound(_) => 404,
        ApiError::Conflict { .. } => 409,
        rest => fallback(rest),
    }
}

fn fallback(_: &ApiError) -> u16 {
    500
}

pub struct Mapper;

impl Mapper {
    pub fn code(&self, e: &ApiError) -> &'static str {
        match e {
            ApiError::NotFound(_) => "not_found",
            ApiError::Conflict { .. } => "conflict",
            ApiError::Invalid => "invalid",
        }
    }
}

pub fn other(l: Level) -> u8 {
    match l {
        Level::Low => 0,
        Level::High => 1,
    }
}
