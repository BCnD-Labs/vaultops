//! The open vault and the rule that every path stays inside it.
//!
//! The vault folder is opened once as a cap-std `Dir`, a handle that every
//! file operation goes through. cap-std refuses any step that would leave the
//! folder (`..`, absolute paths, symlinks pointing outside) in the same
//! operation that touches the file, so there is no gap between check and use.
//!
//! On top of that, `Vault::resolve` checks the frontend's vault-relative path
//! (same rules as `src/core/vault-path`) and keeps the vault's own `.git`
//! folder off limits, also when reached through a symlink: git hooks there
//! are code that would run.

use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use cap_std::ambient_authority;
use cap_std::fs::Dir;

use crate::host_error::{ErrorCode, HostError};

const MAX_PART_BYTES: usize = 255;

/// The vault the app has open. Neither the root path nor the handle is ever
/// sent to the frontend.
pub struct Vault {
    root: PathBuf,
    dir: Dir,
}

impl std::fmt::Debug for Vault {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Vault").finish_non_exhaustive()
    }
}

/// Tauri state: the open vault, if any.
#[derive(Default)]
pub struct VaultState(pub Mutex<Option<Vault>>);

/// A checked path inside the vault.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultPath {
    /// The vault-relative path parts, as given.
    pub parts: Vec<String>,
    /// The same path for use with `Vault::dir` (relative, capital letters as given).
    pub rel: PathBuf,
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
        let dir = Dir::open_ambient_dir(&root, ambient_authority())
            .map_err(|e| HostError::from_io(&e))?;
        Ok(Self { root, dir })
    }

    /// The canonical root path, for Rust-side use only (tests, git later).
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The sandboxed handle every file operation goes through.
    pub fn dir(&self) -> &Dir {
        &self.dir
    }

    /// Check a vault-relative path for use with `dir()`.
    /// `""` is the vault root and is only accepted when `allow_root` is true.
    pub fn resolve(&self, path: &str, allow_root: bool) -> Result<VaultPath, HostError> {
        let parts = check_relative(path, allow_root)?;
        let mut rel = PathBuf::new();
        for part in &parts {
            rel.push(part);
            if !self.check_existing(&rel)? {
                // The rest of the path does not exist yet; nothing to follow.
                break;
            }
        }
        let rel = parts.iter().collect();
        Ok(VaultPath { parts, rel })
    }

    /// If `rel` exists, where it really leads (after symlinks) must be inside
    /// the vault and not inside `.git`. Returns whether it exists.
    fn check_existing(&self, rel: &Path) -> Result<bool, HostError> {
        match self.dir.symlink_metadata(rel) {
            // Missing, or a file sits where a folder is expected: nothing more
            // to follow; the operation itself reports the right error.
            Err(e) if matches!(e.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory) => {
                return Ok(false);
            }
            Err(_) => return Err(HostError::invalid("path leads outside the vault")),
            Ok(meta) if !meta.file_type().is_symlink() => return Ok(true),
            Ok(_) => {}
        }
        // A symlink: resolve it inside the sandbox. Pointing outside, or
        // nowhere, is an error here.
        let real = self
            .dir
            .canonicalize(rel)
            .map_err(|_| HostError::invalid("path leads outside the vault"))?;
        if real
            .components()
            .any(|c| matches!(c, Component::Normal(p) if p.eq_ignore_ascii_case(".git")))
        {
            return Err(HostError::invalid("the .git folder is off limits"));
        }
        Ok(true)
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
        assert_eq!(p.rel, Path::new("notes").join("Idea.vnote"));
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

    /// The same cases the TypeScript checker runs; both sides must agree.
    #[test]
    fn agrees_with_the_shared_path_cases() {
        let data: serde_json::Value =
            serde_json::from_str(include_str!("../../test-fixtures/vault-paths.json")).unwrap();
        for case in data["cases"].as_array().unwrap() {
            let path = case["path"].as_str().unwrap();
            let allow_root = case["allowRoot"].as_bool().unwrap_or(false);
            let result = check_relative(path, allow_root);
            assert_eq!(result.is_ok(), case["ok"].as_bool().unwrap(), "{path:?}");
            if let (Ok(parts), Some(expected)) = (&result, case["parts"].as_array()) {
                let expected: Vec<&str> = expected.iter().map(|p| p.as_str().unwrap()).collect();
                assert_eq!(parts, &expected, "{path:?}");
            }
        }
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
    fn refuses_a_symlink_into_the_git_folder() {
        use std::os::unix::fs::symlink;
        let (_tmp, vault) = setup();
        std::fs::create_dir_all(vault.root().join(".git/hooks")).unwrap();
        // Relative links, so cap-std would follow them; the .git rule must stop them.
        symlink(".git", vault.root().join("alias")).unwrap();
        symlink(".git/hooks", vault.root().join("hooks")).unwrap();
        for bad in ["alias", "alias/hooks/pre-commit", "hooks/pre-commit"] {
            assert_eq!(
                code(vault.resolve(bad, false)),
                ErrorCode::InvalidPath,
                "{bad:?}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn sandbox_blocks_escapes_even_without_resolve() {
        use std::os::unix::fs::symlink;
        let (tmp, vault) = setup();
        let outside = tmp.path().join("outside");
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(outside.join("secret.txt"), "x").unwrap();
        symlink(&outside, vault.root().join("link")).unwrap();
        // Going straight to the handle (skipping resolve) still cannot escape.
        assert!(vault.dir().read_to_string("link/secret.txt").is_err());
        assert!(vault.dir().read_to_string("../outside/secret.txt").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn allows_symlinks_that_stay_inside() {
        use std::os::unix::fs::symlink;
        let (_tmp, vault) = setup();
        std::fs::create_dir(vault.root().join("real")).unwrap();
        symlink("real", vault.root().join("alias")).unwrap();
        assert!(vault.resolve("alias/note.vnote", false).is_ok());
    }

    /// cap-std cannot check where an absolute link leads, so it refuses them,
    /// even ones that point back inside the vault.
    #[cfg(unix)]
    #[test]
    fn refuses_absolute_symlinks_even_inside() {
        use std::os::unix::fs::symlink;
        let (_tmp, vault) = setup();
        std::fs::create_dir(vault.root().join("real")).unwrap();
        symlink(vault.root().join("real"), vault.root().join("abs")).unwrap();
        assert_eq!(
            code(vault.resolve("abs/note.vnote", false)),
            ErrorCode::InvalidPath
        );
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
