//! The vault's cache, `.vaultops/cache/`: files the app can rebuild (display
//! copies of images and the like), safe to delete at any time.
//!
//! Paths are relative to the cache folder and follow the same rule as
//! `isCachePath` in src/host/host.ts: parts of letters, digits, `-`, `_` and
//! `.`, never starting with a dot. Every folder on the way must be a real
//! folder, never a symlink, so nothing here can reach a note. Writes are
//! atomic (temporary file, then rename), like `file_ops::write_text_atomic`.

use std::io::ErrorKind;

use cap_std::fs::Dir;

use crate::file_ops::{io, write_temp};
use crate::host_error::{ErrorCode, HostError};
use crate::vault::Vault;

/// Same limit as `MAX_CACHE_BYTES` in src/host/host.ts.
pub const MAX_CACHE_BYTES: usize = 25 * 1024 * 1024;

const CACHE_FOLDER: [&str; 2] = [".vaultops", "cache"];

fn is_cache_part(part: &str) -> bool {
    let allowed = |b: u8| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.';
    !part.is_empty() && part.len() <= 200 && !part.starts_with('.') && part.bytes().all(allowed)
}

/// The full list of folder names from the vault root, then the file name.
fn cache_parts(path: &str) -> Result<Vec<&str>, HostError> {
    let parts: Vec<&str> = path.split('/').collect();
    if !parts.iter().all(|part| is_cache_part(part)) {
        return Err(HostError::invalid("not a valid cache path"));
    }
    Ok(CACHE_FOLDER.iter().copied().chain(parts).collect())
}

/// Open the folder that holds the file, one real folder at a time. With
/// `create`, missing folders are made; without, a missing one gives None.
fn open_parent(vault: &Vault, folders: &[&str], create: bool) -> Result<Option<Dir>, HostError> {
    let mut dir = vault.dir().try_clone().map_err(io)?;
    for name in folders {
        match dir.symlink_metadata(name) {
            Ok(meta) if meta.is_symlink() => {
                return Err(HostError::invalid("cache paths cannot use symlinks"));
            }
            Ok(meta) if !meta.is_dir() => {
                return Err(HostError::new(
                    ErrorCode::NotAFolder,
                    "a file is in the way",
                ));
            }
            Ok(_) => {}
            Err(e) if e.kind() == ErrorKind::NotFound && create => match dir.create_dir(name) {
                Ok(()) => {}
                Err(e) if e.kind() == ErrorKind::AlreadyExists => {}
                Err(e) => return Err(io(e)),
            },
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(io(e)),
        }
        dir = dir.open_dir(name).map_err(io)?;
    }
    Ok(Some(dir))
}

/// The cached file, or `not-found` when nothing is cached there yet.
pub fn read_cache(vault: &Vault, path: &str) -> Result<Vec<u8>, HostError> {
    let parts = cache_parts(path)?;
    let (name, folders) = parts.split_last().expect("cache paths have parts");
    let not_found = || HostError::new(ErrorCode::NotFound, "not cached");
    let parent = open_parent(vault, folders, false)?.ok_or_else(not_found)?;
    match parent.symlink_metadata(name) {
        Ok(meta) if meta.is_symlink() => Err(HostError::invalid("cache paths cannot use symlinks")),
        Ok(meta) if meta.is_dir() => Err(HostError::new(ErrorCode::IsAFolder, "path is a folder")),
        Ok(_) => parent.read(name).map_err(io),
        Err(e) if e.kind() == ErrorKind::NotFound => Err(not_found()),
        Err(e) => Err(io(e)),
    }
}

/// Replace or create a cached file atomically, making missing folders.
pub fn write_cache(vault: &Vault, path: &str, bytes: &[u8]) -> Result<(), HostError> {
    let parts = cache_parts(path)?;
    if bytes.len() > MAX_CACHE_BYTES {
        return Err(HostError::invalid("the file is larger than 25 MB"));
    }
    let (name, folders) = parts.split_last().expect("cache paths have parts");
    let parent = open_parent(vault, folders, true)?.expect("folders were created");
    match parent.symlink_metadata(name) {
        Ok(meta) if meta.is_symlink() => {
            return Err(HostError::invalid("cache paths cannot use symlinks"));
        }
        Ok(meta) if meta.is_dir() => {
            return Err(HostError::new(ErrorCode::IsAFolder, "path is a folder"));
        }
        _ => {}
    }
    let temp = write_temp(&parent, bytes)?;
    if let Err(e) = parent.rename(&temp, &parent, name) {
        let _ = parent.remove_file(&temp);
        return Err(io(e));
    }
    Ok(())
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

    #[test]
    fn writes_and_reads_inside_the_cache_folder_only() {
        let (_tmp, vault) = setup();
        assert_eq!(code(read_cache(&vault, "images/a")), ErrorCode::NotFound);
        write_cache(&vault, "images/a", b"one").unwrap();
        write_cache(&vault, "images/a", b"two").unwrap();
        assert_eq!(read_cache(&vault, "images/a").unwrap(), b"two");
        let images = vault.root().join(".vaultops/cache/images");
        assert_eq!(fs::read(images.join("a")).unwrap(), b"two");
        assert_eq!(
            fs::read_dir(&images).unwrap().count(),
            1,
            "no temp files left"
        );
        assert_eq!(code(read_cache(&vault, "images")), ErrorCode::IsAFolder);
    }

    #[test]
    fn refuses_paths_that_could_leave_the_cache() {
        let (_tmp, vault) = setup();
        fs::write(vault.root().join("note.vnote"), "keep").unwrap();
        for bad in [
            "../../note.vnote",
            "images/../../../note.vnote",
            "/abs",
            "a//b",
            "",
            ".hidden",
            "images/.x",
            "a\\b",
            "naïve",
        ] {
            assert_eq!(
                code(read_cache(&vault, bad)),
                ErrorCode::InvalidPath,
                "{bad}"
            );
            assert_eq!(
                code(write_cache(&vault, bad, b"x")),
                ErrorCode::InvalidPath,
                "{bad}"
            );
        }
        let big = vec![0u8; MAX_CACHE_BYTES + 1];
        assert_eq!(
            code(write_cache(&vault, "big", &big)),
            ErrorCode::InvalidPath
        );
        assert_eq!(
            fs::read_to_string(vault.root().join("note.vnote")).unwrap(),
            "keep"
        );
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlinks_on_the_way() {
        use std::os::unix::fs::symlink;
        let (tmp, vault) = setup();
        let outside = tmp.path().join("outside");
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("a"), "secret").unwrap();
        fs::create_dir(vault.root().join(".vaultops")).unwrap();
        // The cache folder itself is a link out of the vault.
        symlink(&outside, vault.root().join(".vaultops/cache")).unwrap();
        assert_eq!(code(read_cache(&vault, "a")), ErrorCode::InvalidPath);
        assert_eq!(code(write_cache(&vault, "a", b"x")), ErrorCode::InvalidPath);
        assert_eq!(fs::read_to_string(outside.join("a")).unwrap(), "secret");
        // A cached file that is a link to a note inside the vault.
        fs::remove_file(vault.root().join(".vaultops/cache")).unwrap();
        fs::create_dir(vault.root().join(".vaultops/cache")).unwrap();
        fs::write(vault.root().join("note.vnote"), "keep").unwrap();
        symlink("../../note.vnote", vault.root().join(".vaultops/cache/n")).unwrap();
        assert_eq!(code(read_cache(&vault, "n")), ErrorCode::InvalidPath);
        assert_eq!(code(write_cache(&vault, "n", b"x")), ErrorCode::InvalidPath);
        assert_eq!(
            fs::read_to_string(vault.root().join("note.vnote")).unwrap(),
            "keep"
        );
    }
}
