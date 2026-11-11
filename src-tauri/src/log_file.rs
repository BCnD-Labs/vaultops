//! The app's own log file: plain text lines appended in the app's log folder
//! (never inside a vault). The window sends text only; the location is chosen
//! here. Size is capped so logging can never fill the disk: when the file would
//! pass `MAX_BYTES` it becomes `vaultops.log.1` (replacing the older one) and a
//! new file starts.

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::Path;

pub const LOG_NAME: &str = "vaultops.log";
const OLD_NAME: &str = "vaultops.log.1";
/// A log file never grows past this (plus one call), so two files hold at most ~10 MB.
pub const MAX_BYTES: u64 = 5 * 1024 * 1024;
/// One call may carry at most this much text.
pub const MAX_CALL_BYTES: usize = 256 * 1024;

/// Append `text` (a newline is added if missing) to the log in `dir`.
pub fn append(dir: &Path, text: &str) -> io::Result<()> {
    if text.len() > MAX_CALL_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "log batch too large",
        ));
    }
    if text.is_empty() {
        return Ok(());
    }
    fs::create_dir_all(dir)?;
    let file = dir.join(LOG_NAME);
    let size = fs::metadata(&file).map(|m| m.len()).unwrap_or(0);
    if size > 0 && size + text.len() as u64 > MAX_BYTES {
        // Replaces any older backup; rename is atomic on the same folder.
        fs::rename(&file, dir.join(OLD_NAME))?;
    }
    let mut out = OpenOptions::new().create(true).append(true).open(&file)?;
    out.write_all(text.as_bytes())?;
    if !text.ends_with('\n') {
        out.write_all(b"\n")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Tmp(PathBuf);
    impl Tmp {
        fn new() -> Self {
            static N: AtomicUsize = AtomicUsize::new(0);
            let dir = std::env::temp_dir().join(format!(
                "vaultops-log-test-{}-{}",
                std::process::id(),
                N.fetch_add(1, Ordering::SeqCst)
            ));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }
    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn creates_the_folder_and_appends_lines_in_order() {
        let tmp = Tmp::new();
        let dir = tmp.0.join("logs/nested");
        append(&dir, "one").unwrap();
        append(&dir, "two\n").unwrap();
        let text = fs::read_to_string(dir.join(LOG_NAME)).unwrap();
        assert_eq!(text, "one\ntwo\n");
    }

    #[test]
    fn empty_text_writes_nothing() {
        let tmp = Tmp::new();
        append(&tmp.0, "").unwrap();
        assert!(!tmp.0.join(LOG_NAME).exists());
    }

    #[test]
    fn refuses_an_oversized_batch_without_writing() {
        let tmp = Tmp::new();
        let big = "x".repeat(MAX_CALL_BYTES + 1);
        let err = append(&tmp.0, &big).unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::InvalidInput);
        assert!(!tmp.0.join(LOG_NAME).exists());
    }

    #[test]
    fn rotates_instead_of_growing_past_the_cap() {
        let tmp = Tmp::new();
        let chunk = "y".repeat(MAX_CALL_BYTES);
        let calls = (MAX_BYTES as usize / MAX_CALL_BYTES) + 3;
        for _ in 0..calls {
            append(&tmp.0, &chunk).unwrap();
        }
        let current = fs::metadata(tmp.0.join(LOG_NAME)).unwrap().len();
        let old = fs::metadata(tmp.0.join(OLD_NAME)).unwrap().len();
        assert!(current <= MAX_BYTES);
        assert!(old <= MAX_BYTES + MAX_CALL_BYTES as u64);
        assert!(current > 0);
    }

    #[test]
    fn a_new_rotation_replaces_the_older_backup() {
        let tmp = Tmp::new();
        fs::write(tmp.0.join(OLD_NAME), "ancient").unwrap();
        fs::write(tmp.0.join(LOG_NAME), "z".repeat(MAX_BYTES as usize)).unwrap();
        append(&tmp.0, "fresh").unwrap();
        assert_eq!(fs::read_to_string(tmp.0.join(LOG_NAME)).unwrap(), "fresh\n");
        assert_eq!(fs::metadata(tmp.0.join(OLD_NAME)).unwrap().len(), MAX_BYTES);
    }
}
