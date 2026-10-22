//! Reading and atomically writing text files inside the vault.
//!
//! Atomic write: the new text goes to a temporary file in the same folder,
//! is flushed to disk, then renamed over the target in one step. A crash at
//! any point leaves the old file or the new file, never a partial one.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::host_error::{ErrorCode, HostError};
use crate::vault::Vault;

/// Prefix of temporary files; anything left by a crash can be cleaned up by name.
pub const TEMP_PREFIX: &str = ".vaultops-tmp-";

pub fn read_text(vault: &Vault, path: &str) -> Result<String, HostError> {
    let target = vault.resolve(path, false)?;
    let meta = fs::metadata(&target.full).map_err(|e| HostError::from_io(&e))?;
    if meta.is_dir() {
        return Err(HostError::new(ErrorCode::IsAFolder, "path is a folder"));
    }
    let bytes = fs::read(&target.full).map_err(|e| HostError::from_io(&e))?;
    String::from_utf8(bytes).map_err(|_| HostError::new(ErrorCode::Io, "file is not UTF-8 text"))
}

pub fn write_text_atomic(vault: &Vault, path: &str, text: &str) -> Result<(), HostError> {
    let target = vault.resolve(path, false)?;
    let parent = target
        .full
        .parent()
        .ok_or_else(|| HostError::invalid("path has no folder"))?
        .to_path_buf();
    match fs::metadata(&parent) {
        Ok(meta) if meta.is_dir() => {}
        Ok(_) => {
            return Err(HostError::new(
                ErrorCode::NotAFolder,
                "parent is not a folder",
            ));
        }
        Err(_) => return Err(HostError::new(ErrorCode::NotFound, "folder not found")),
    }
    let final_path = existing_name_or(&parent, &target.full)?;
    let temp = write_temp(&parent, text.as_bytes())?;
    if let Err(e) = fs::rename(&temp, &final_path) {
        let _ = fs::remove_file(&temp);
        return Err(HostError::from_io(&e));
    }
    sync_folder(&parent);
    Ok(())
}

/// If an entry already exists at `target` (the Mac matches names ignoring
/// capital letters and Unicode form), return its real name on disk so the
/// first-written name is kept. Refuses folders and symlinks.
fn existing_name_or(parent: &Path, target: &Path) -> Result<PathBuf, HostError> {
    let Ok(meta) = fs::symlink_metadata(target) else {
        return Ok(target.to_path_buf());
    };
    if meta.file_type().is_symlink() {
        return Err(HostError::invalid("cannot write through a symlink"));
    }
    if meta.is_dir() {
        return Err(HostError::new(ErrorCode::IsAFolder, "path is a folder"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let entries = fs::read_dir(parent).map_err(|e| HostError::from_io(&e))?;
        for entry in entries.flatten() {
            if let Ok(m) = entry.metadata()
                && m.ino() == meta.ino()
                && m.dev() == meta.dev()
            {
                return Ok(entry.path());
            }
        }
    }
    Ok(target.to_path_buf())
}

fn write_temp(parent: &Path, bytes: &[u8]) -> Result<PathBuf, HostError> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    for _ in 0..16 {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(0);
        let name = format!(
            "{TEMP_PREFIX}{}-{}-{nanos}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        );
        let temp = parent.join(name);
        // create_new never opens an existing file or follows a symlink.
        let file = match OpenOptions::new().write(true).create_new(true).open(&temp) {
            Ok(f) => f,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(HostError::from_io(&e)),
        };
        return match fill(file, bytes) {
            Ok(()) => Ok(temp),
            Err(e) => {
                let _ = fs::remove_file(&temp);
                Err(HostError::from_io(&e))
            }
        };
    }
    Err(HostError::new(
        ErrorCode::Io,
        "could not create a temporary file",
    ))
}

fn fill(mut file: File, bytes: &[u8]) -> std::io::Result<()> {
    file.write_all(bytes)?;
    file.sync_all()
}

/// Flush the folder entry so the rename itself survives a power loss.
fn sync_folder(folder: &Path) {
    #[cfg(unix)]
    if let Ok(dir) = File::open(folder) {
        let _ = dir.sync_all();
    }
    #[cfg(not(unix))]
    let _ = folder;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::TempDir;

    fn setup() -> (TempDir, Vault) {
        let tmp = TempDir::new();
        let root = tmp.path().join("vault");
        fs::create_dir(&root).unwrap();
        let vault = Vault::open(&root).unwrap();
        (tmp, vault)
    }

    fn code<T: std::fmt::Debug>(r: Result<T, HostError>) -> ErrorCode {
        r.expect_err("expected an error").code
    }

    fn leftover_temps(dir: &Path) -> usize {
        fs::read_dir(dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with(TEMP_PREFIX))
            .count()
    }

    #[test]
    fn writes_reads_and_overwrites() {
        let (_tmp, vault) = setup();
        write_text_atomic(&vault, "a.vnote", "one").unwrap();
        assert_eq!(read_text(&vault, "a.vnote").unwrap(), "one");
        write_text_atomic(&vault, "a.vnote", "two").unwrap();
        assert_eq!(read_text(&vault, "a.vnote").unwrap(), "two");
        assert_eq!(leftover_temps(vault.root()), 0);
    }

    #[test]
    fn keeps_unicode_text_exactly() {
        let (_tmp, vault) = setup();
        let text = "Title 😀 café 日本\n";
        write_text_atomic(&vault, "u.vnote", text).unwrap();
        assert_eq!(read_text(&vault, "u.vnote").unwrap(), text);
    }

    #[test]
    fn gives_clear_error_codes() {
        let (_tmp, vault) = setup();
        fs::create_dir(vault.root().join("f")).unwrap();
        fs::write(vault.root().join("file"), "x").unwrap();
        assert_eq!(code(read_text(&vault, "nope")), ErrorCode::NotFound);
        assert_eq!(code(read_text(&vault, "f")), ErrorCode::IsAFolder);
        assert_eq!(
            code(write_text_atomic(&vault, "f", "x")),
            ErrorCode::IsAFolder
        );
        assert_eq!(
            code(write_text_atomic(&vault, "missing/a", "x")),
            ErrorCode::NotFound
        );
        assert_eq!(
            code(write_text_atomic(&vault, "file/a", "x")),
            ErrorCode::NotAFolder
        );
        assert_eq!(
            code(write_text_atomic(&vault, "../x", "x")),
            ErrorCode::InvalidPath
        );
    }

    #[test]
    fn refuses_text_that_is_not_utf8() {
        let (_tmp, vault) = setup();
        fs::write(vault.root().join("bin"), [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(code(read_text(&vault, "bin")), ErrorCode::Io);
    }

    #[cfg(unix)]
    #[test]
    fn never_writes_through_a_final_symlink() {
        use std::os::unix::fs::symlink;
        let (tmp, vault) = setup();
        // A symlink inside the vault to another file inside the vault.
        fs::write(vault.root().join("real.vnote"), "original").unwrap();
        symlink(
            vault.root().join("real.vnote"),
            vault.root().join("alias.vnote"),
        )
        .unwrap();
        assert_eq!(
            code(write_text_atomic(&vault, "alias.vnote", "x")),
            ErrorCode::InvalidPath
        );
        assert_eq!(
            fs::read_to_string(vault.root().join("real.vnote")).unwrap(),
            "original"
        );
        // A symlink to a file outside the vault.
        let outside = tmp.path().join("outside.txt");
        fs::write(&outside, "keep").unwrap();
        symlink(&outside, vault.root().join("out.vnote")).unwrap();
        assert!(write_text_atomic(&vault, "out.vnote", "x").is_err());
        assert_eq!(fs::read_to_string(&outside).unwrap(), "keep");
    }

    #[test]
    fn keeps_the_first_written_name_when_names_match() {
        let (_tmp, vault) = setup();
        write_text_atomic(&vault, "Note.vnote", "1").unwrap();
        // Same name: nothing to look up, but the rule still holds.
        write_text_atomic(&vault, "Note.vnote", "2").unwrap();
        let names: Vec<String> = fs::read_dir(vault.root())
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["Note.vnote".to_string()]);
        // On a case-insensitive volume (macOS) "note.vnote" is the same file;
        // it must be written in place and keep the name "Note.vnote".
        if vault.root().join("NOTE.VNOTE").exists() {
            write_text_atomic(&vault, "note.vnote", "3").unwrap();
            let names: Vec<String> = fs::read_dir(vault.root())
                .unwrap()
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect();
            assert_eq!(names, vec!["Note.vnote".to_string()]);
            assert_eq!(read_text(&vault, "Note.vnote").unwrap(), "3");
        }
    }

    /// Kill a writer process again and again in the middle of writing a large
    /// file: every time, the file must be wholly the old or wholly the new text.
    #[cfg(unix)]
    #[test]
    fn a_killed_write_leaves_old_or_new_never_partial() {
        let (tmp, vault) = setup();
        let size = 4 * 1024 * 1024;
        let a = "A".repeat(size);
        write_text_atomic(&vault, "big.vnote", &a).unwrap();
        let exe = std::env::current_exe().unwrap();
        for round in 0..12u64 {
            let mut child = std::process::Command::new(&exe)
                .args([
                    "--exact",
                    "file_ops::tests::kill_helper",
                    "--ignored",
                    "--nocapture",
                ])
                .env("VAULTOPS_KILL_HELPER", vault.root())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .unwrap();
            std::thread::sleep(std::time::Duration::from_millis(40 + round * 17));
            child.kill().unwrap();
            child.wait().unwrap();
            let text = fs::read_to_string(vault.root().join("big.vnote")).unwrap();
            assert_eq!(text.len(), size, "round {round}: partial file");
            let first = text.as_bytes()[0];
            assert!(
                text.bytes().all(|b| b == first),
                "round {round}: mixed content"
            );
        }
        drop(tmp);
    }

    /// Run only as a child of the test above: rewrite the file forever.
    #[test]
    #[ignore = "helper process for a_killed_write_leaves_old_or_new_never_partial"]
    fn kill_helper() {
        let Some(root) = std::env::var_os("VAULTOPS_KILL_HELPER") else {
            return;
        };
        let vault = Vault::open(Path::new(&root)).unwrap();
        let size = 4 * 1024 * 1024;
        let (a, b) = ("A".repeat(size), "B".repeat(size));
        loop {
            write_text_atomic(&vault, "big.vnote", &b).unwrap();
            write_text_atomic(&vault, "big.vnote", &a).unwrap();
        }
    }
}
