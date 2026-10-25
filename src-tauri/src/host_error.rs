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

#[cfg(test)]
mod tests {
    use super::*;

    /// The TypeScript side checks the same file (src/host/tauri-host.test.ts).
    #[test]
    fn error_codes_match_the_shared_list() {
        let shared: Vec<String> =
            serde_json::from_str(include_str!("../../test-fixtures/host-error-codes.json"))
                .unwrap();
        let ours: Vec<String> = [
            ErrorCode::NotFound,
            ErrorCode::AlreadyExists,
            ErrorCode::NotAFolder,
            ErrorCode::IsAFolder,
            ErrorCode::InvalidPath,
            ErrorCode::Io,
        ]
        .iter()
        .map(|code| {
            serde_json::to_value(code)
                .unwrap()
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect();
        assert_eq!(ours, shared);
    }

    #[test]
    fn errors_reach_the_frontend_as_code_and_message() {
        let value = serde_json::to_value(HostError::new(ErrorCode::NotFound, "not found")).unwrap();
        assert_eq!(
            value,
            serde_json::json!({ "code": "not-found", "message": "not found" })
        );
    }
}
