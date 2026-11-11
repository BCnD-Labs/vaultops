//! Move, list, make folder and "what is at this path", inside the vault.
//!
//! Same behavior as the TypeScript `Host` contract (src/host/host-contract.ts).
//! Every operation goes through the vault's cap-std handle.

use std::io::ErrorKind;
use std::path::PathBuf;

use cap_std::fs::MetadataExt;
use serde::Serialize;

use crate::file_ops::{TEMP_PREFIX, io, open_folder};
use crate::host_error::{ErrorCode, HostError};
use crate::vault::Vault;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    File,
    Folder,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub kind: EntryKind,
}

/// What is at a path (following symlinks that stay inside), or `None`.
pub fn kind_of(vault: &Vault, path: &str) -> Result<Option<EntryKind>, HostError> {
    let target = vault.resolve(path, true)?;
    if target.parts.is_empty() {
        return Ok(Some(EntryKind::Folder)); // the vault itself
    }
    match vault.dir().metadata(&target.rel) {
        Ok(meta) if meta.is_dir() => Ok(Some(EntryKind::Folder)),
        Ok(_) => Ok(Some(EntryKind::File)),
        Err(e) if matches!(e.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory) => Ok(None),
        Err(e) => Err(io(e)),
    }
}

/// List a folder ("" is the vault root), sorted by name. Leaves out the
/// `.git` folder, temporary files from interrupted writes, names that are not
/// valid UTF-8, and symlinks that lead outside the vault or into `.git`.
pub fn list(vault: &Vault, folder: &str) -> Result<Vec<DirEntry>, HostError> {
    let target = vault.resolve(folder, true)?;
    let dir = open_folder(vault.dir(), &target.rel)?;
    let mut entries = Vec::new();
    for entry in dir.entries().map_err(io)?.flatten() {
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if name.eq_ignore_ascii_case(".git") || name.starts_with(TEMP_PREFIX) {
            continue;
        }
        let child = if folder.is_empty() {
            name.clone()
        } else {
            format!("{folder}/{name}")
        };
        if let Ok(Some(kind)) = kind_of(vault, &child) {
            entries.push(DirEntry { name, kind });
        }
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

/// Create a folder and any missing parents. An existing folder is fine.
pub fn make_folder(vault: &Vault, path: &str) -> Result<(), HostError> {
    let target = vault.resolve(path, false)?;
    let mut rel = PathBuf::new();
    for part in &target.parts {
        rel.push(part);
        match vault.dir().metadata(&rel) {
            Ok(meta) if meta.is_dir() => continue,
            Ok(_) => {
                return Err(HostError::new(
                    ErrorCode::NotAFolder,
                    "a file is in the way",
                ));
            }
            Err(e) if e.kind() == ErrorKind::NotFound => {}
            Err(e) => return Err(io(e)),
        }
        match vault.dir().create_dir(&rel) {
            Ok(()) => {}
            // Created by someone else in the meantime: fine if it is a folder.
            Err(e) if e.kind() == ErrorKind::AlreadyExists && vault.dir().is_dir(&rel) => {}
            Err(e) => return Err(io(e)),
        }
    }
    Ok(())
}

/// Move or rename a file or folder. Refuses an existing target, except a
/// rename that only changes capital letters or Unicode form of the same entry
/// (the Mac sees those as one name).
pub fn move_entry(vault: &Vault, from: &str, to: &str) -> Result<(), HostError> {
    let source = vault.resolve(from, false)?;
    let target = vault.resolve(to, false)?;
    let dir = vault.dir();
    let source_meta = match dir.symlink_metadata(&source.rel) {
        Ok(meta) => meta,
        Err(e) if matches!(e.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory) => {
            return Err(HostError::new(ErrorCode::NotFound, "source not found"));
        }
        Err(e) => return Err(io(e)),
    };
    if source_meta.is_dir() && is_inside(&target.parts, &source.parts) {
        return Err(HostError::invalid("cannot move a folder into itself"));
    }
    let parent: PathBuf = target.parts[..target.parts.len() - 1].iter().collect();
    open_folder(dir, &parent)?;
    match dir.symlink_metadata(&target.rel) {
        Err(e) if matches!(e.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory) => {}
        Ok(meta) if meta.dev() == source_meta.dev() && meta.ino() == source_meta.ino() => {}
        Ok(_) => {
            return Err(HostError::new(
                ErrorCode::AlreadyExists,
                "target already exists",
            ));
        }
        Err(e) => return Err(io(e)),
    }
    dir.rename(&source.rel, dir, &target.rel).map_err(io)
}

/// Whether `inner` is strictly below `outer`, comparing names the way the Mac
/// does for ASCII (ignoring capital letters).
fn is_inside(inner: &[String], outer: &[String]) -> bool {
    inner.len() > outer.len()
        && outer
            .iter()
            .zip(inner)
            .all(|(a, b)| a.to_lowercase() == b.to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::file_ops::{read_text, write_text_atomic};
    use crate::test_util::TempDir;

    fn setup() -> (TempDir, Vault) {
        let tmp = TempDir::new();
        let root = tmp.path().join("vault");
        std::fs::create_dir(&root).unwrap();
        let vault = Vault::open(&root).unwrap();
        (tmp, vault)
    }

    fn code<T: std::fmt::Debug>(r: Result<T, HostError>) -> ErrorCode {
        r.expect_err("expected an error").code
    }

    fn names(vault: &Vault, folder: &str) -> Vec<(String, EntryKind)> {
        list(vault, folder)
            .unwrap()
            .into_iter()
            .map(|e| (e.name, e.kind))
            .collect()
    }

    #[test]
    fn makes_folders_with_parents_and_again_without_error() {
        let (_tmp, v) = setup();
        make_folder(&v, "a/b/c").unwrap();
        make_folder(&v, "a/b/c").unwrap();
        assert_eq!(kind_of(&v, "a/b").unwrap(), Some(EntryKind::Folder));
        write_text_atomic(&v, "a/b/c/n.vnote", "x").unwrap();
        assert_eq!(kind_of(&v, "a/b/c/n.vnote").unwrap(), Some(EntryKind::File));
    }

    #[test]
    fn lists_a_folder_sorted_by_name_root_included() {
        let (_tmp, v) = setup();
        make_folder(&v, "Zeta").unwrap();
        write_text_atomic(&v, "beta.vnote", "x").unwrap();
        write_text_atomic(&v, "Alpha.vnote", "x").unwrap();
        assert_eq!(
            names(&v, ""),
            vec![
                ("Alpha.vnote".into(), EntryKind::File),
                ("Zeta".into(), EntryKind::Folder),
                ("beta.vnote".into(), EntryKind::File),
            ]
        );
    }

    #[test]
    fn listing_hides_git_and_leftover_temp_files() {
        let (_tmp, v) = setup();
        std::fs::create_dir(v.root().join(".git")).unwrap();
        std::fs::write(v.root().join(format!("{TEMP_PREFIX}1-2-3")), "x").unwrap();
        write_text_atomic(&v, "n.vnote", "x").unwrap();
        assert_eq!(names(&v, ""), vec![("n.vnote".into(), EntryKind::File)]);
    }

    #[cfg(unix)]
    #[test]
    fn listing_skips_symlinks_that_lead_outside() {
        use std::os::unix::fs::symlink;
        let (tmp, v) = setup();
        std::fs::create_dir(tmp.path().join("outside")).unwrap();
        symlink(tmp.path().join("outside"), v.root().join("out")).unwrap();
        make_folder(&v, "real").unwrap();
        symlink("real", v.root().join("alias")).unwrap();
        assert_eq!(
            names(&v, ""),
            vec![
                ("alias".into(), EntryKind::Folder),
                ("real".into(), EntryKind::Folder),
            ]
        );
    }

    #[test]
    fn reports_what_is_at_a_path() {
        let (_tmp, v) = setup();
        make_folder(&v, "f").unwrap();
        write_text_atomic(&v, "f/n", "x").unwrap();
        assert_eq!(kind_of(&v, "f").unwrap(), Some(EntryKind::Folder));
        assert_eq!(kind_of(&v, "f/n").unwrap(), Some(EntryKind::File));
        assert_eq!(kind_of(&v, "nothing").unwrap(), None);
        assert_eq!(kind_of(&v, "f/n/deeper").unwrap(), None);
        assert_eq!(kind_of(&v, "").unwrap(), Some(EntryKind::Folder));
    }

    #[test]
    fn gives_clear_error_codes() {
        let (_tmp, v) = setup();
        write_text_atomic(&v, "file", "x").unwrap();
        assert_eq!(code(list(&v, "file")), ErrorCode::NotAFolder);
        assert_eq!(code(list(&v, "missing")), ErrorCode::NotFound);
        assert_eq!(code(make_folder(&v, "file/sub")), ErrorCode::NotAFolder);
        for bad in ["/abs", "../up", "a/../b", "a//b", "a\\b", "", ".git"] {
            assert_eq!(
                code(make_folder(&v, bad)),
                ErrorCode::InvalidPath,
                "{bad:?}"
            );
            assert_eq!(
                code(move_entry(&v, "x", bad)),
                ErrorCode::InvalidPath,
                "{bad:?}"
            );
        }
    }

    #[test]
    fn moves_and_renames_files_and_folders() {
        let (_tmp, v) = setup();
        make_folder(&v, "from/inner").unwrap();
        write_text_atomic(&v, "from/inner/n.vnote", "x").unwrap();
        make_folder(&v, "to").unwrap();
        move_entry(&v, "from", "to/moved").unwrap();
        assert_eq!(read_text(&v, "to/moved/inner/n.vnote").unwrap(), "x");
        assert_eq!(kind_of(&v, "from").unwrap(), None);
    }

    #[test]
    fn refuses_to_move_onto_an_existing_entry() {
        let (_tmp, v) = setup();
        write_text_atomic(&v, "a", "1").unwrap();
        write_text_atomic(&v, "b", "2").unwrap();
        assert_eq!(code(move_entry(&v, "a", "b")), ErrorCode::AlreadyExists);
        assert_eq!(read_text(&v, "b").unwrap(), "2");
    }

    #[test]
    fn refuses_to_move_a_folder_into_itself() {
        let (_tmp, v) = setup();
        make_folder(&v, "f/g").unwrap();
        assert_eq!(code(move_entry(&v, "f", "f/g/f")), ErrorCode::InvalidPath);
        assert_eq!(code(move_entry(&v, "f", "F/g/f")), ErrorCode::InvalidPath);
    }

    #[test]
    fn fails_moving_something_that_is_not_there() {
        let (_tmp, v) = setup();
        assert_eq!(code(move_entry(&v, "ghost", "x")), ErrorCode::NotFound);
        write_text_atomic(&v, "n", "x").unwrap();
        assert_eq!(code(move_entry(&v, "n", "missing/n")), ErrorCode::NotFound);
    }

    /// Runs only on a case-insensitive volume (macOS CI).
    #[test]
    fn renames_when_only_capital_letters_change() {
        let (_tmp, v) = setup();
        write_text_atomic(&v, "note.vnote", "x").unwrap();
        if kind_of(&v, "NOTE.vnote").unwrap().is_none() {
            return; // case-sensitive file system: nothing to check
        }
        move_entry(&v, "note.vnote", "Note.vnote").unwrap();
        assert_eq!(names(&v, ""), vec![("Note.vnote".into(), EntryKind::File)]);
        write_text_atomic(&v, "other", "2").unwrap();
        assert_eq!(
            code(move_entry(&v, "other", "NOTE.VNOTE")),
            ErrorCode::AlreadyExists
        );
    }
}
