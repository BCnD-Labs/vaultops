//! The maintainer's reports folder: a folder chosen with the system picker
//! where the app drops report files (logs, crash reports) so they can be read
//! outside the app. Nothing is sent over a network. The window never sees the
//! folder's location, only its name, and can only create plain `.txt` files
//! with a safe name in it (no overwriting of other kinds of files, no paths).

use std::fs;
use std::io::{self, Write};
use std::path::Path;

/// One report file never holds more than this.
pub const MAX_REPORT_BYTES: usize = 512 * 1024;

/// A name made only of letters, digits, `-`, `_` and `.`, ending in `.txt`,
/// not starting with a dot.
pub fn valid_name(name: &str) -> bool {
    name.len() <= 100
        && name.ends_with(".txt")
        && !name.starts_with('.')
        && !name.contains("..")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// Whether `folder` is the same as `root` or inside it (both resolved first, so
/// links and `..` can't hide it). A folder that can't be resolved counts as
/// inside, so the answer errs on the safe side.
pub fn is_inside(folder: &Path, root: &Path) -> bool {
    match (folder.canonicalize(), root.canonicalize()) {
        (Ok(folder), Ok(root)) => folder.starts_with(root),
        _ => true,
    }
}

/// Write the report into `dir` atomically (the folder must already exist).
/// An existing report with the same name is replaced.
pub fn write(dir: &Path, name: &str, text: &str) -> io::Result<()> {
    if !valid_name(name) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "not a valid report name",
        ));
    }
    if text.len() > MAX_REPORT_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "report too large",
        ));
    }
    if !dir.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "reports folder is missing",
        ));
    }
    let temp = dir.join(format!(".{name}.tmp"));
    let mut file = fs::File::create(&temp)?;
    file.write_all(text.as_bytes())?;
    file.sync_all()?;
    drop(file);
    fs::rename(&temp, dir.join(name))
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
                "vaultops-reports-test-{}-{}",
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
    fn accepts_plain_txt_names_only() {
        assert!(valid_name("vaultops-report-2026-10-28T23-30-00Z.txt"));
        assert!(valid_name("a_b.1.txt"));
        for bad in [
            "",
            "x",
            "x.md",
            ".hidden.txt",
            "../x.txt",
            "a/b.txt",
            "a\\b.txt",
            "a b.txt",
            "a..b.txt",
            "é.txt",
        ] {
            assert!(!valid_name(bad), "{bad}");
        }
        assert!(!valid_name(&format!("{}.txt", "a".repeat(100))));
    }

    #[test]
    fn writes_and_replaces_a_report() {
        let tmp = Tmp::new();
        write(&tmp.0, "r.txt", "one").unwrap();
        write(&tmp.0, "r.txt", "two").unwrap();
        assert_eq!(fs::read_to_string(tmp.0.join("r.txt")).unwrap(), "two");
        let leftovers: Vec<_> = fs::read_dir(&tmp.0).unwrap().collect();
        assert_eq!(leftovers.len(), 1);
    }

    #[test]
    fn refuses_bad_names_and_big_reports_without_writing() {
        let tmp = Tmp::new();
        assert!(write(&tmp.0, "../x.txt", "x").is_err());
        assert!(write(&tmp.0, "r.txt", &"x".repeat(MAX_REPORT_BYTES + 1)).is_err());
        assert_eq!(fs::read_dir(&tmp.0).unwrap().count(), 0);
    }

    #[test]
    fn a_folder_in_or_equal_to_the_vault_is_inside() {
        let tmp = Tmp::new();
        let vault = tmp.0.join("vault");
        let nested = vault.join("reports");
        let outside = tmp.0.join("elsewhere");
        for d in [&vault, &nested, &outside] {
            fs::create_dir_all(d).unwrap();
        }
        assert!(is_inside(&vault, &vault));
        assert!(is_inside(&nested, &vault));
        assert!(is_inside(&vault.join("reports/../reports"), &vault));
        assert!(!is_inside(&outside, &vault));
        // The vault inside the reports folder is fine.
        assert!(!is_inside(&tmp.0, &vault));
        assert!(is_inside(&tmp.0.join("missing"), &vault));
    }

    #[test]
    fn a_missing_folder_is_not_created() {
        let tmp = Tmp::new();
        let gone = tmp.0.join("nope");
        let err = write(&gone, "r.txt", "x").unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::NotFound);
        assert!(!gone.exists());
    }
}
