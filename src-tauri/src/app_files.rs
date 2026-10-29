//! A few small files the app keeps for itself, outside any vault: the session
//! marker used to notice a crash, the last crash report, the maintainer switch
//! and the text kept when the window is closed with unsaved edits. Only the names in
//! `ALLOWED` can be read or written, so the window can never pick a path. Writes
//! are atomic (temporary file, then rename). Also reads the end of the log file.

use std::fs;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::Path;

use crate::log_file::LOG_NAME;

/// The only file names the window may use.
pub const ALLOWED: &[&str] = &[
    "session.json",
    "crash-report.txt",
    "maintainer.json",
    "unsaved-recovery.txt",
];
/// One file never holds more than this.
pub const MAX_FILE_BYTES: usize = 256 * 1024;
/// The tail read looks at most this far back from the end of the log.
const TAIL_WINDOW: u64 = 128 * 1024;
/// And returns at most this many lines.
pub const MAX_TAIL_LINES: usize = 200;

fn check_name(name: &str) -> io::Result<()> {
    if ALLOWED.contains(&name) {
        Ok(())
    } else {
        Err(io::Error::new(io::ErrorKind::InvalidInput, "unknown file"))
    }
}

/// The file's text, or `None` if it doesn't exist yet.
pub fn read(dir: &Path, name: &str) -> io::Result<Option<String>> {
    check_name(name)?;
    match fs::read_to_string(dir.join(name)) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Replace or create the file atomically.
pub fn write(dir: &Path, name: &str, text: &str) -> io::Result<()> {
    check_name(name)?;
    if text.len() > MAX_FILE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "file too large",
        ));
    }
    fs::create_dir_all(dir)?;
    let temp = dir.join(format!("{name}.tmp"));
    let mut file = fs::File::create(&temp)?;
    file.write_all(text.as_bytes())?;
    file.sync_all()?;
    drop(file);
    fs::rename(&temp, dir.join(name))
}

/// The last `max_lines` lines of the current log file ("" if there is none).
pub fn log_tail(log_dir: &Path, max_lines: usize) -> io::Result<String> {
    let max_lines = max_lines.min(MAX_TAIL_LINES);
    let mut file = match fs::File::open(log_dir.join(LOG_NAME)) {
        Ok(f) => f,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(String::new()),
        Err(e) => return Err(e),
    };
    let len = file.metadata()?.len();
    let start = len.saturating_sub(TAIL_WINDOW);
    file.seek(SeekFrom::Start(start))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    let text = String::from_utf8_lossy(&bytes);
    let mut lines: Vec<&str> = text.lines().collect();
    if start > 0 && !lines.is_empty() {
        lines.remove(0); // probably cut in the middle
    }
    let from = lines.len().saturating_sub(max_lines);
    Ok(lines[from..].join("\n"))
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
                "vaultops-appfiles-test-{}-{}",
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
    fn a_missing_file_reads_as_none() {
        let tmp = Tmp::new();
        assert_eq!(read(&tmp.0, "session.json").unwrap(), None);
    }

    #[test]
    fn writes_then_reads_back_and_replaces() {
        let tmp = Tmp::new();
        let dir = tmp.0.join("config/nested");
        write(&dir, "session.json", "one").unwrap();
        write(&dir, "session.json", "two").unwrap();
        assert_eq!(read(&dir, "session.json").unwrap().as_deref(), Some("two"));
        assert!(!dir.join("session.json.tmp").exists());
    }

    #[test]
    fn refuses_names_that_are_not_on_the_list() {
        let tmp = Tmp::new();
        for name in ["../x", "session.json/../x", "other.txt", "/etc/passwd", ""] {
            assert!(write(&tmp.0, name, "x").is_err(), "{name}");
            assert!(read(&tmp.0, name).is_err(), "{name}");
        }
    }

    #[test]
    fn refuses_an_oversized_file_without_touching_the_old_one() {
        let tmp = Tmp::new();
        write(&tmp.0, "crash-report.txt", "keep").unwrap();
        let big = "x".repeat(MAX_FILE_BYTES + 1);
        assert!(write(&tmp.0, "crash-report.txt", &big).is_err());
        assert_eq!(
            read(&tmp.0, "crash-report.txt").unwrap().as_deref(),
            Some("keep")
        );
    }

    #[test]
    fn tail_is_empty_without_a_log() {
        let tmp = Tmp::new();
        assert_eq!(log_tail(&tmp.0, 30).unwrap(), "");
    }

    #[test]
    fn tail_returns_the_last_lines_in_order() {
        let tmp = Tmp::new();
        let text: String = (1..=50).map(|n| format!("line {n}\n")).collect();
        fs::write(tmp.0.join(LOG_NAME), text).unwrap();
        let tail = log_tail(&tmp.0, 3).unwrap();
        assert_eq!(tail, "line 48\nline 49\nline 50");
    }

    #[test]
    fn tail_of_a_big_log_drops_the_cut_first_line_and_caps_the_count() {
        let tmp = Tmp::new();
        let text: String = (1..=40_000).map(|n| format!("entry {n:06}\n")).collect();
        fs::write(tmp.0.join(LOG_NAME), text).unwrap();
        let tail = log_tail(&tmp.0, 10_000).unwrap();
        let lines: Vec<&str> = tail.lines().collect();
        assert_eq!(lines.len(), MAX_TAIL_LINES);
        assert_eq!(*lines.last().unwrap(), "entry 040000");
        assert!(lines.iter().all(|l| l.starts_with("entry ")));
    }
}
