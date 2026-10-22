//! The open vault and the rule that every path stays inside it.
//!
//! The frontend only ever sends vault-relative paths (same rules as
//! `src/core/vault-path`). `Vault::resolve` checks them again here, joins them
//! to the canonical vault root and refuses anything that could reach outside:
//! `..`, absolute paths, symlinks that lead out of the vault, and the vault's
//! own `.git` folder (git hooks there are code that would run).

use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use crate::host_error::{ErrorCode, HostError};

const MAX_PART_BYTES: usize = 255;

/// The vault the app has open. Holds the canonical root path; it is never
/// sent to the frontend.
#[derive(Debug, Clone)]
pub struct Vault {
    root: PathBuf,
}

/// Tauri state: the open vault, if any.
#[derive(Default)]
pub struct VaultState(pub Mutex<Option<Vault>>);

/// A checked path inside the vault.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultPath {
    /// The vault-relative path parts, as given.
    pub parts: Vec<String>,
    /// The full path on disk (root joined with the parts, not canonicalized,
    /// so the name's capital letters are kept as given).
    pub full: PathBuf,
}

impl Vault {
    /// Open a folder as the vault root. It must exist and be a folder.
    pub fn open(root: &Path) -> Result<Self, HostError> {
        let root = root.canonicalize().map_err(|e| HostError::from_io(&e))?;
        if !root.is_dir() {
            return Err(HostError::new(
                ErrorCode::NotAFolder,
                "vault is not a folder",
            ));
        }
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Check a vault-relative path and resolve it inside the vault.
    /// `""` is the vault root and is only accepted when `allow_root` is true.
    pub fn resolve(&self, path: &str, allow_root: bool) -> Result<VaultPath, HostError> {
        let parts = check_relative(path, allow_root)?;
        let mut full = self.root.clone();
        for part in &parts {
            full.push(part);
            self.check_existing_component(&full)?;
        }
        Ok(VaultPath { parts, full })
    }

    /// If `path` exists and is a symlink, its target must be inside the vault.
    /// A missing path is fine (it may be about to be created); its parent was
    /// already checked by the previous step.
    fn check_existing_component(&self, path: &Path) -> Result<(), HostError> {
        let Ok(meta) = std::fs::symlink_metadata(path) else {
            return Ok(());
        };
        if !meta.file_type().is_symlink() {
            return Ok(());
        }
        match path.canonicalize() {
            Ok(target) if self.contains(&target) => Ok(()),
            // A symlink pointing outside, or one that points nowhere.
            _ => Err(HostError::invalid("path leads outside the vault")),
        }
    }

    /// Whether a canonical path is the root or inside it. Compares whole path
    /// parts, so a sibling like `vault-evil` is not inside `vault`.
    fn contains(&self, canonical: &Path) -> bool {
        canonical.starts_with(&self.root)
    }
}

/// Check a vault-relative path string and split it into parts.
pub fn check_relative(path: &str, allow_root: bool) -> Result<Vec<String>, HostError> {
    if path.is_empty() {
        return if allow_root {
            Ok(Vec::new())
        } else {
            Err(HostError::invalid("path is empty"))
        };
    }
    if path.starts_with('/') {
        return Err(HostError::invalid("path is absolute"));
    }
    if path.contains('\\') {
        return Err(HostError::invalid("path has a backslash"));
    }
    if path.chars().any(|c| c < '\u{20}' || c == '\u{7f}') {
        return Err(HostError::invalid("path has a control character"));
    }
    let mut parts = Vec::new();
    for part in path.split('/') {
        if part.is_empty() {
            return Err(HostError::invalid("path has an empty part"));
        }
        if part == "." || part == ".." {
            return Err(HostError::invalid("path has a . or .. part"));
        }
        if part.len() > MAX_PART_BYTES {
            return Err(HostError::invalid("a path part is longer than 255 bytes"));
        }
        if part.eq_ignore_ascii_case(".git") {
            return Err(HostError::invalid("the .git folder is off limits"));
        }
        parts.push(part.to_owned());
    }
    // Belt and braces: the joined path must only contain normal components.
    let joined: PathBuf = parts.iter().collect();
    if !joined
        .components()
        .all(|c| matches!(c, Component::Normal(_)))
    {
        return Err(HostError::invalid("path is not a plain relative path"));
    }
    Ok(parts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::TempDir;

    fn setup() -> (TempDir, Vault) {
        let tmp = TempDir::new();
        let root = tmp.path().join("vault");
        std::fs::create_dir(&root).unwrap();
        let vault = Vault::open(&root).unwrap();
        (tmp, vault)
    }

    fn code(r: Result<VaultPath, HostError>) -> ErrorCode {
        r.expect_err("expected an error").code
    }

    #[test]
    fn resolves_plain_paths_inside_the_vault() {
        let (_tmp, vault) = setup();
        let p = vault.resolve("notes/Idea.vnote", false).unwrap();
        assert_eq!(p.parts, vec!["notes", "Idea.vnote"]);
        assert_eq!(p.full, vault.root().join("notes").join("Idea.vnote"));
        assert!(vault.resolve("", true).unwrap().parts.is_empty());
    }

    #[test]
    fn refuses_escapes_and_bad_paths() {
        let (_tmp, vault) = setup();
        for bad in [
            "",
            "../x",
            "a/../../x",
            "/etc/passwd",
            "a/./b",
            "a//b",
            "a/",
            "a\\b",
            "a\u{0}b",
            "a\nb",
        ] {
            assert_eq!(
                code(vault.resolve(bad, false)),
                ErrorCode::InvalidPath,
                "{bad:?}"
            );
        }
        assert_eq!(
            code(vault.resolve(&"x".repeat(256), false)),
            ErrorCode::InvalidPath
        );
        assert_eq!(
            code(vault.resolve(&"é".repeat(128), false)),
            ErrorCode::InvalidPath
        );
    }

    #[test]
    fn refuses_the_git_folder_in_any_case() {
        let (_tmp, vault) = setup();
        for bad in [
            ".git",
            ".git/hooks/pre-commit",
            "sub/.git/config",
            ".GIT/config",
        ] {
            assert_eq!(
                code(vault.resolve(bad, false)),
                ErrorCode::InvalidPath,
                "{bad:?}"
            );
        }
        assert!(vault.resolve(".gitignore", false).is_ok());
        assert!(vault.resolve(".vaultops/config.json", false).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlinks_that_lead_outside() {
        use std::os::unix::fs::symlink;
        let (tmp, vault) = setup();
        let outside = tmp.path().join("outside");
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(outside.join("secret.txt"), "x").unwrap();
        symlink(&outside, vault.root().join("link")).unwrap();
        assert_eq!(code(vault.resolve("link", false)), ErrorCode::InvalidPath);
        assert_eq!(
            code(vault.resolve("link/secret.txt", false)),
            ErrorCode::InvalidPath
        );
        assert_eq!(
            code(vault.resolve("link/new.vnote", false)),
            ErrorCode::InvalidPath
        );
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_sibling_folder_with_a_similar_name() {
        use std::os::unix::fs::symlink;
        let (tmp, vault) = setup();
        let evil = tmp.path().join("vault-evil");
        std::fs::create_dir(&evil).unwrap();
        symlink(&evil, vault.root().join("evil")).unwrap();
        assert_eq!(code(vault.resolve("evil/x", false)), ErrorCode::InvalidPath);
    }

    #[cfg(unix)]
    #[test]
    fn allows_symlinks_that_stay_inside() {
        use std::os::unix::fs::symlink;
        let (_tmp, vault) = setup();
        std::fs::create_dir(vault.root().join("real")).unwrap();
        symlink(vault.root().join("real"), vault.root().join("alias")).unwrap();
        assert!(vault.resolve("alias/note.vnote", false).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_dangling_symlink() {
        use std::os::unix::fs::symlink;
        let (tmp, vault) = setup();
        symlink(tmp.path().join("nowhere"), vault.root().join("dangling")).unwrap();
        assert_eq!(
            code(vault.resolve("dangling", false)),
            ErrorCode::InvalidPath
        );
    }

    #[test]
    fn errors_never_contain_a_path() {
        let (_tmp, vault) = setup();
        let root = vault.root().to_string_lossy().to_string();
        for bad in ["../x", "/etc/passwd", ".git/config"] {
            let error = vault.resolve(bad, false).unwrap_err();
            let json = serde_json::to_string(&error).unwrap();
            assert!(!json.contains(&root), "{json}");
            assert!(!json.contains("/etc"), "{json}");
        }
        let missing = Vault::open(&vault.root().join("missing")).unwrap_err();
        assert_eq!(missing.code, ErrorCode::NotFound);
        assert!(!serde_json::to_string(&missing).unwrap().contains(&root));
    }

    #[test]
    fn error_codes_serialize_like_the_typescript_ones() {
        let json = serde_json::to_string(&HostError::invalid("x")).unwrap();
        assert_eq!(json, r#"{"code":"invalid-path","message":"x"}"#);
        let json = serde_json::to_string(&HostError::new(ErrorCode::AlreadyExists, "y")).unwrap();
        assert!(json.contains(r#""already-exists""#));
    }

    #[test]
    fn opening_a_file_as_the_vault_fails() {
        let (_tmp, vault) = setup();
        let file = vault.root().join("file.txt");
        std::fs::write(&file, "x").unwrap();
        assert_eq!(Vault::open(&file).unwrap_err().code, ErrorCode::NotAFolder);
    }
}
