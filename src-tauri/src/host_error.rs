use serde::Serialize;

/// Error codes shared with the TypeScript `HostError` (src/host/host.ts).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ErrorCode {
    NotFound,
    AlreadyExists,
    NotAFolder,
    IsAFolder,
    InvalidPath,
    Io,
}

/// An error sent to the frontend. The message is a fixed, short sentence and
/// never contains a path on disk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HostError {
    pub code: ErrorCode,
    pub message: &'static str,
}

impl HostError {
    pub const fn new(code: ErrorCode, message: &'static str) -> Self {
        Self { code, message }
    }

    pub const fn invalid(message: &'static str) -> Self {
        Self::new(ErrorCode::InvalidPath, message)
    }

    /// Map an operating-system error to a code, dropping its text (which can
    /// contain paths).
    pub fn from_io(error: &std::io::Error) -> Self {
        use std::io::ErrorKind;
        match error.kind() {
            ErrorKind::NotFound => Self::new(ErrorCode::NotFound, "not found"),
            ErrorKind::AlreadyExists => Self::new(ErrorCode::AlreadyExists, "already exists"),
            ErrorKind::NotADirectory => Self::new(ErrorCode::NotAFolder, "not a folder"),
            ErrorKind::IsADirectory => Self::new(ErrorCode::IsAFolder, "is a folder"),
            _ => Self::new(ErrorCode::Io, "file system error"),
        }
    }
}

impl std::fmt::Display for HostError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.message)
    }
}

impl std::error::Error for HostError {}
