//! Reading and atomically writing text files inside the vault.
//!
//! Every operation goes through the vault's cap-std handle (`Vault::dir`),
//! so it cannot reach outside the vault folder.
//!
//! Atomic write: the new text goes to a temporary file in the same folder,
//! is flushed to disk, then renamed over the target in one step. A crash at
//! any point leaves the old file or the new file, never a partial one.

use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use cap_std::fs::{Dir, MetadataExt, OpenOptions};

use crate::host_error::{ErrorCode, HostError};
use crate::vault::Vault;

/// Prefix of temporary files; anything left by a crash can be cleaned up by name.
pub const TEMP_PREFIX: &str = ".vaultops-tmp-";

pub(crate) fn io(e: std::io::Error) -> HostError {
    HostError::from_io(&e)
}

pub fn read_text(vault: &Vault, path: &str) -> Result<String, HostError> {
    let target = vault.resolve(path, false)?;
    let meta = vault.dir().metadata(&target.rel).map_err(io)?;
    if meta.is_dir() {
        return Err(HostError::new(ErrorCode::IsAFolder, "path is a folder"));
    }
    let bytes = vault.dir().read(&target.rel).map_err(io)?;
    String::from_utf8(bytes).map_err(|_| HostError::new(ErrorCode::Io, "file is not UTF-8 text"))
}

pub fn write_text_atomic(vault: &Vault, path: &str, text: &str) -> Result<(), HostError> {
    let target = vault.resolve(path, false)?;
    let (parent_parts, name) = target.parts.split_at(target.parts.len() - 1);
    let parent_rel: PathBuf = parent_parts.iter().collect();
    let parent = open_folder(vault.dir(), &parent_rel)?;
    let name = existing_name_or(&parent, &name[0])?;
    let temp = write_temp(&parent, text.as_bytes())?;
    if let Err(e) = parent.rename(&temp, &parent, &name) {
        let _ = parent.remove_file(&temp);
        return Err(io(e));
    }
    // Flush the folder entry so the rename itself survives a power loss.
    if let Ok(handle) = parent.open(".") {
        let _ = handle.sync_all();
    }
    Ok(())
}

/// Open a folder inside the vault ("" is the vault itself).
pub(crate) fn open_folder(dir: &Dir, rel: &Path) -> Result<Dir, HostError> {
    if rel.as_os_str().is_empty() {
        return dir.try_clone().map_err(io);
    }
    match dir.metadata(rel) {
        Ok(meta) if meta.is_dir() => dir.open_dir(rel).map_err(io),
        Ok(_) => Err(HostError::new(
            ErrorCode::NotAFolder,
            "parent is not a folder",
        )),
        Err(e) if e.kind() == ErrorKind::NotFound => {
            Err(HostError::new(ErrorCode::NotFound, "folder not found"))
        }
        Err(e) => Err(io(e)),
    }
}

/// If an entry already exists under `name` (the Mac matches names ignoring
/// capital letters and Unicode form), return its real name so the
/// first-written name is kept. Refuses folders and symlinks.
fn existing_name_or(parent: &Dir, name: &str) -> Result<String, HostError> {
    let meta = match parent.symlink_metadata(name) {
        Ok(meta) => meta,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(name.to_owned()),
        Err(e) => return Err(io(e)),
    };
    if meta.file_type().is_symlink() {
        return Err(HostError::invalid("cannot write through a symlink"));
    }
    if meta.is_dir() {
        return Err(HostError::new(ErrorCode::IsAFolder, "path is a folder"));
    }
    for entry in parent.entries().map_err(io)?.flatten() {
        if let Ok(m) = entry.metadata()
            && m.ino() == meta.ino()
            && m.dev() == meta.dev()
            && let Some(real) = entry.file_name().to_str()
        {
            return Ok(real.to_owned());
        }
    }
    Ok(name.to_owned())
}

fn write_temp(parent: &Dir, bytes: &[u8]) -> Result<String, HostError> {
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
        // create_new never opens an existing file or follows a symlink.
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        let mut file = match parent.open_with(&name, &options) {
            Ok(f) => f,
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(io(e)),
        };
        let written = file.write_all(bytes).and_then(|()| file.sync_all());
        return match written {
            Ok(()) => Ok(name),
            Err(e) => {
                let _ = parent.remove_file(&name);
                Err(io(e))
            }
        };
    }
    Err(HostError::new(
        ErrorCode::Io,
        "could not create a temporary file",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::TempDir;
    use std::fs;

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
        // Relative, so it passes the path check and reaches the write's own rule.
        symlink("real.vnote", vault.root().join("alias.vnote")).unwrap();
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
