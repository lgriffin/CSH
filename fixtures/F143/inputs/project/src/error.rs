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

impl ApiError {
    pub fn kind(&self) -> u16 {
        match self {
            Self::NotFound(_) => 1,
            Self::Conflict { .. } => 2,
            Self::Invalid => 3,
        }
    }
}

pub fn by_ref(e: &ApiError) -> u16 {
    match e {
        &ApiError::NotFound(_) => 404,
        c @ &ApiError::Conflict { .. } => conflict(c),
        &ApiError::Invalid => 400,
    }
}

fn conflict(_: &ApiError) -> u16 {
    409
}

pub enum Light {
    Low,
    High,
}

pub fn bare(l: Level) -> u8 {
    use Level::*;
    match l {
        Low => 0,
        High => 1,
    }
}

pub fn unattributed() -> u8 {
    use Level::*;
    match pick() {
        Low => 0,
        High => 1,
    }
}

fn pick() -> Level {
    Level::Low
}
