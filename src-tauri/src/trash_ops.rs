//! Deleting one note forever, only from `.vaultops/trash/`.
//!
//! This is the one place in the app that really erases a note, so it is
//! deliberately narrow: it removes a single file that sits inside a time folder
//! of the trash (`.vaultops/trash/<time>/<original path>`), and nothing else.
//! Same behavior as the TypeScript `Host` contract (src/host/host-contract.ts).

use std::io::ErrorKind;
use std::path::PathBuf;

use crate::file_ops::io;
use crate::host_error::{ErrorCode, HostError};
use crate::vault::Vault;

/// The folders above a trashed note: `.vaultops`, `trash`, then the time folder.
const TRASH_DEPTH: usize = 3;

/// Permanently delete the note at `path` (vault-relative, inside the trash), then
/// remove the folders it leaves empty, up to but never including `.vaultops/trash`.
///
/// Refuses (`invalid-path`) anything that is not at least one level inside a
/// time folder of `.vaultops/trash/`, spelled exactly like that, and anything
/// reached through a symlink, so a link in the trash can never lead to a note
/// elsewhere in the vault. A folder is refused (`is-a-folder`); only one note
/// is deleted per call.
pub fn remove_trashed(vault: &Vault, path: &str) -> Result<(), HostError> {
    let target = vault.resolve(path, false)?;
    let parts = &target.parts;
    if parts.len() <= TRASH_DEPTH || parts[0] != ".vaultops" || parts[1] != "trash" {
        return Err(HostError::invalid(
            "only a note inside .vaultops/trash can be deleted forever",
        ));
    }
    let dir = vault.dir();

    // Every step of the way must be a real file or folder, never a symlink.
    let mut rel = PathBuf::new();
    for part in parts {
        rel.push(part);
        match dir.symlink_metadata(&rel) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err(HostError::invalid("cannot delete through a symlink"));
            }
            Ok(_) => {}
            Err(e) if matches!(e.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory) => {
                return Err(HostError::new(ErrorCode::NotFound, "note not found"));
            }
            Err(e) => return Err(io(e)),
        }
    }
    if dir.symlink_metadata(&target.rel).map_err(io)?.is_dir() {
        return Err(HostError::new(ErrorCode::IsAFolder, "path is a folder"));
    }

    dir.remove_file(&target.rel).map_err(io)?;

    // Tidy up: remove each folder the note left empty, innermost first. A folder
    // that still holds something (or any other problem) stops the tidying; the
    // note itself is already gone.
    for len in (TRASH_DEPTH..parts.len()).rev() {
        let folder: PathBuf = parts[..len].iter().collect();
        if dir.remove_dir(&folder).is_err() {
            break;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::file_ops::write_text_atomic;
    use crate::folder_ops::{EntryKind, kind_of, make_folder};
    use crate::test_util::TempDir;

    const STAMP: &str = ".vaultops/trash/2026-11-01T10-00-00-000Z";

    fn setup() -> (TempDir, Vault) {
        let tmp = TempDir::new();
        let root = tmp.path().join("vault");
        std::fs::create_dir(&root).unwrap();
        let vault = Vault::open(&root).unwrap();
        (tmp, vault)
    }

    fn trash_note(v: &Vault, rel: &str) -> String {
        let path = format!("{STAMP}/{rel}");
        let folder = path.rsplit_once('/').unwrap().0;
        make_folder(v, folder).unwrap();
        write_text_atomic(v, &path, "x").unwrap();
        path
    }

    fn code<T: std::fmt::Debug>(r: Result<T, HostError>) -> ErrorCode {
        r.expect_err("expected an error").code
    }

    fn kind(v: &Vault, path: &str) -> Option<EntryKind> {
        kind_of(v, path).unwrap()
    }

    #[test]
    fn deletes_a_trashed_note_and_the_folders_it_leaves_empty() {
        let (_tmp, v) = setup();
        let path = trash_note(&v, "Notes/Deep/a.vnote");
        remove_trashed(&v, &path).unwrap();
        assert_eq!(kind(&v, &path), None);
        assert_eq!(kind(&v, STAMP), None, "the empty time folder goes too");
        assert_eq!(
            kind(&v, ".vaultops/trash"),
            Some(EntryKind::Folder),
            "the trash folder itself stays"
        );
    }

    #[test]
    fn keeps_a_sibling_and_its_folders() {
        let (_tmp, v) = setup();
        let a = trash_note(&v, "Notes/a.vnote");
        let b = trash_note(&v, "Notes/b.vnote");
        remove_trashed(&v, &a).unwrap();
        assert_eq!(kind(&v, &a), None);
        assert_eq!(kind(&v, &b), Some(EntryKind::File));
        assert_eq!(kind(&v, STAMP), Some(EntryKind::Folder));
    }

    #[test]
    fn refuses_anything_outside_the_trash() {
        let (_tmp, v) = setup();
        write_text_atomic(&v, "a.vnote", "x").unwrap();
        make_folder(&v, ".vaultops/history/s").unwrap();
        write_text_atomic(&v, ".vaultops/history/s/a.vnote", "x").unwrap();
        write_text_atomic(&v, ".vaultops/config.json", "{}").unwrap();
        let inside = trash_note(&v, "a.vnote");
        write_text_atomic(&v, ".vaultops/trash/loose.vnote", "x").unwrap();
        for bad in [
            "a.vnote",
            ".vaultops/config.json",
            ".vaultops/history/s/a.vnote",
            ".vaultops/trash",
            STAMP,
            ".vaultops/trash/loose.vnote",
            ".VaultOps/trash/s/a.vnote",
            ".vaultops/Trash/s/a.vnote",
            "../a.vnote",
            "/a.vnote",
            "",
        ] {
            assert_eq!(
                code(remove_trashed(&v, bad)),
                ErrorCode::InvalidPath,
                "{bad:?}"
            );
        }
        assert_eq!(kind(&v, "a.vnote"), Some(EntryKind::File));
        assert_eq!(
            kind(&v, ".vaultops/history/s/a.vnote"),
            Some(EntryKind::File)
        );
        assert_eq!(kind(&v, ".vaultops/config.json"), Some(EntryKind::File));
        assert_eq!(
            kind(&v, ".vaultops/trash/loose.vnote"),
            Some(EntryKind::File)
        );
        assert_eq!(kind(&v, &inside), Some(EntryKind::File));
    }

    #[test]
    fn refuses_a_folder_and_reports_a_missing_note() {
        let (_tmp, v) = setup();
        let note = trash_note(&v, "Notes/a.vnote");
        assert_eq!(
            code(remove_trashed(&v, &format!("{STAMP}/Notes"))),
            ErrorCode::IsAFolder
        );
        assert_eq!(kind(&v, &note), Some(EntryKind::File));
        assert_eq!(
            code(remove_trashed(&v, &format!("{STAMP}/Notes/missing.vnote"))),
            ErrorCode::NotFound
        );
        assert_eq!(
            code(remove_trashed(&v, &format!("{STAMP}/Nowhere/a.vnote"))),
            ErrorCode::NotFound
        );
    }

    #[cfg(unix)]
    #[test]
    fn never_deletes_through_a_symlink() {
        use std::os::unix::fs::symlink;
        let (_tmp, v) = setup();
        make_folder(&v, "Notes").unwrap();
        write_text_atomic(&v, "Notes/keep.vnote", "x").unwrap();
        let real = trash_note(&v, "real.vnote");
        // A link to a note, and a link to a whole folder, both inside the trash.
        symlink(
            "../../../Notes/keep.vnote",
            v.root().join(format!("{STAMP}/note-link")),
        )
        .unwrap();
        symlink("../../../Notes", v.root().join(format!("{STAMP}/dir-link"))).unwrap();
        assert_eq!(
            code(remove_trashed(&v, &format!("{STAMP}/note-link"))),
            ErrorCode::InvalidPath
        );
        assert_eq!(
            code(remove_trashed(&v, &format!("{STAMP}/dir-link/keep.vnote"))),
            ErrorCode::InvalidPath
        );
        assert_eq!(kind(&v, "Notes/keep.vnote"), Some(EntryKind::File));
        assert_eq!(kind(&v, &real), Some(EntryKind::File));
    }
}
