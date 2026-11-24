//! The vault's history commands, built on `git_ops`. Each one takes the open
//! vault's root, never a path from the frontend, and builds git's arguments
//! itself.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::git_ops::{self, GitError, GitErrorCode};
use crate::vault::VaultState;

/// The vault's root, copied out so the vault lock isn't held while git runs.
pub fn vault_root(state: &VaultState) -> Result<PathBuf, GitError> {
    let guard = state
        .0
        .lock()
        .map_err(|_| GitError::io("vault state is unavailable"))?;
    guard
        .as_ref()
        .map(|v| v.root().to_path_buf())
        .ok_or_else(|| GitError::io("no vault is open"))
}

/// True when history is on: the vault root holds its own `.git` folder. A
/// `.git` file (a linked worktree) or a repo in a folder above the vault does
/// not count, so git never works on files outside the vault.
pub fn is_enabled(root: &Path) -> bool {
    root.join(".git").is_dir()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ChangeKind {
    Modified,
    Added,
    Deleted,
    Renamed,
    Untracked,
    Conflicted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub path: String,
    pub kind: ChangeKind,
    /// The old path of a rename.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// False when history is off for this vault; the rest is then empty.
    pub enabled: bool,
    /// The current branch, or None when detached or before the first save point.
    pub branch: Option<String>,
    pub changes: Vec<Change>,
}

fn kind_of(xy: &str) -> ChangeKind {
    if xy.contains('D') {
        ChangeKind::Deleted
    } else if xy.contains('A') {
        ChangeKind::Added
    } else {
        ChangeKind::Modified
    }
}

/// Parse `git status --porcelain=v2 -z --branch --untracked-files=all`.
pub fn parse_status(out: &[u8]) -> (Option<String>, Vec<Change>) {
    let text = String::from_utf8_lossy(out);
    let mut fields = text.split('\0').filter(|f| !f.is_empty());
    let mut branch = None;
    let mut changes = Vec::new();
    // Entries are space-separated fields ending in the path (which may hold spaces).
    let path_after = |line: &str, n: usize| line.splitn(n + 1, ' ').nth(n).map(str::to_string);
    while let Some(line) = fields.next() {
        let head = line.split(' ').next().unwrap_or("");
        let xy = line.split(' ').nth(1).unwrap_or("");
        match head {
            "#" => {
                if let Some(name) = line
                    .strip_prefix("# branch.head ")
                    .filter(|name| *name != "(detached)")
                {
                    branch = Some(name.to_string());
                }
            }
            "1" => {
                if let Some(path) = path_after(line, 8) {
                    changes.push(Change {
                        path,
                        kind: kind_of(xy),
                        from: None,
                    });
                }
            }
            "2" => {
                let from = fields.next().map(str::to_string);
                if let Some(path) = path_after(line, 9) {
                    changes.push(Change {
                        path,
                        kind: ChangeKind::Renamed,
                        from,
                    });
                }
            }
            "u" => {
                if let Some(path) = path_after(line, 10) {
                    changes.push(Change {
                        path,
                        kind: ChangeKind::Conflicted,
                        from: None,
                    });
                }
            }
            "?" => {
                if let Some(path) = line.strip_prefix("? ") {
                    changes.push(Change {
                        path: path.to_string(),
                        kind: ChangeKind::Untracked,
                        from: None,
                    });
                }
            }
            _ => {}
        }
    }
    (branch, changes)
}

/// What changed since the last save point, or `enabled: false`.
pub fn status(root: &Path) -> Result<Status, GitError> {
    if !is_enabled(root) {
        return Ok(Status {
            enabled: false,
            branch: None,
            changes: Vec::new(),
        });
    }
    let out = git_ops::run(
        root,
        &[
            "status",
            "--porcelain=v2",
            "-z",
            "--branch",
            "--untracked-files=all",
        ],
        None,
        true,
    )?;
    let (branch, changes) = parse_status(&out);
    Ok(Status {
        enabled: true,
        branch,
        changes,
    })
}

impl GitError {
    pub fn io(message: &str) -> Self {
        Self {
            code: GitErrorCode::Io,
            message: message.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::TempDir;

    #[test]
    fn parses_branch_and_every_kind_of_change() {
        let out = [
            "# branch.oid 0123456789abcdef0123456789abcdef01234567",
            "# branch.head main",
            "1 .M N... 100644 100644 100644 aaaaaaa aaaaaaa Notes/My note.vnote",
            "1 A. N... 000000 100644 100644 0000000 bbbbbbb new.vnote",
            "1 .D N... 100644 100644 000000 ccccccc ccccccc gone.vnote",
            "2 R. N... 100644 100644 100644 ddddddd ddddddd R100 b.vnote",
            "a.vnote",
            "u UU N... 100644 100644 100644 100644 e e e both.vnote",
            "? attachments/pic one.png",
            "",
        ]
        .join("\0");
        let (branch, changes) = parse_status(out.as_bytes());
        assert_eq!(branch.as_deref(), Some("main"));
        let kinds: Vec<_> = changes
            .iter()
            .map(|c| (c.path.as_str(), c.kind, c.from.as_deref()))
            .collect();
        assert_eq!(
            kinds,
            vec![
                ("Notes/My note.vnote", ChangeKind::Modified, None),
                ("new.vnote", ChangeKind::Added, None),
                ("gone.vnote", ChangeKind::Deleted, None),
                ("b.vnote", ChangeKind::Renamed, Some("a.vnote")),
                ("both.vnote", ChangeKind::Conflicted, None),
                ("attachments/pic one.png", ChangeKind::Untracked, None),
            ]
        );
    }

    #[test]
    fn a_detached_head_has_no_branch() {
        let (branch, _) = parse_status(b"# branch.head (detached)\0");
        assert_eq!(branch, None);
    }

    #[test]
    fn history_is_off_without_the_vaults_own_git_folder() {
        let dir = TempDir::new();
        // A repo in a folder above the vault does not turn history on.
        let vault = dir.path().join("Vault");
        std::fs::create_dir_all(&vault).unwrap();
        git_ops::run(dir.path(), &["init", "-q"], None, false).unwrap();
        let s = status(&vault).unwrap();
        assert!(!s.enabled);
        assert!(s.changes.is_empty());
    }

    #[test]
    fn reports_real_changes_in_a_vault_repo() {
        let dir = TempDir::new();
        let root = dir.path();
        let git = |args: &[&str]| git_ops::run(root, args, None, false).unwrap();
        git(&["init", "-q", "-b", "main"]);
        std::fs::write(root.join("a.vnote"), "x").unwrap();
        let s = status(root).unwrap();
        assert!(s.enabled);
        assert_eq!(s.branch.as_deref(), Some("main"));
        assert_eq!(
            s.changes,
            vec![Change {
                path: "a.vnote".into(),
                kind: ChangeKind::Untracked,
                from: None
            }]
        );
    }
}
