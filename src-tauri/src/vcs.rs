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

/// A file inside `.git` that marks a repo VaultOps turned on itself.
const MARKER: &str = ".git/vaultops-history";
/// Ignore rules for the vault's history, committed so every copy uses them.
const IGNORE_FILE: &str = ".vaultops/.gitignore";
/// Git attributes kept local to this copy: never line-merge notes.
const ATTRIBUTES_FILE: &str = ".git/info/attributes";
const ATTRIBUTES: &str =
    "# Written by VaultOps: notes are merged by the app, block by block.\n*.vnote -merge\n";
const IGNORE_RULES: &str = "\
# Written by VaultOps when history was turned on. Kept out of the history:
# the recovery folder (a local last resort), caches and other generated files.
/recovery/
/cache/
/index/
/pending/
*.tmp
.DS_Store
._*
";

/// True when history is on: the vault root holds its own `.git` folder that
/// VaultOps set up. A `.git` file (a linked worktree), a repo in a folder above
/// the vault, or a repo someone else made does not count, so git never works
/// on files outside the vault or takes over an existing project.
pub fn is_enabled(root: &Path) -> bool {
    root.join(".git").is_dir() && root.join(MARKER).is_file()
}

/// The vault folder already is a git repo VaultOps didn't set up.
fn is_other_repo(root: &Path) -> bool {
    root.join(".git").exists() && !is_enabled(root)
}

/// The cloud service that syncs this folder, if it looks like one. Their sync
/// can damage a `.git` folder, so the History settings warn about it.
pub fn synced_folder(root: &Path) -> Option<&'static str> {
    let path = root.to_string_lossy();
    if path.contains("/Library/Mobile Documents/") {
        Some("iCloud Drive")
    } else if path.contains("/Dropbox/") || path.contains("CloudStorage/Dropbox") {
        Some("Dropbox")
    } else if path.contains("/Library/CloudStorage/") {
        Some("a cloud storage folder")
    } else {
        None
    }
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
    /// History is off because the folder already is someone else's git repo.
    pub other_repo: bool,
    /// The cloud service syncing the vault folder, if any (a warning).
    pub synced_folder: Option<&'static str>,
    /// The current branch, or None when detached or before the first save point.
    pub branch: Option<String>,
    pub changes: Vec<Change>,
    /// A merge has started and is waiting to be finished or cancelled.
    pub merging: bool,
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
            other_repo: is_other_repo(root),
            synced_folder: synced_folder(root),
            branch: None,
            changes: Vec::new(),
            merging: false,
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
        other_repo: false,
        synced_folder: synced_folder(root),
        branch,
        changes,
        merging: root.join(".git/MERGE_HEAD").is_file(),
    })
}

/// The longest description a save point keeps (characters).
const MAX_MESSAGE_CHARS: usize = 10_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePoint {
    /// False when there was nothing to save; no save point was made.
    pub saved: bool,
    /// The new save point's short id.
    pub commit: Option<String>,
    pub status: Status,
}

/// Make a save point of every change, or only of `paths` (vault-relative).
/// The description goes to git on stdin. An empty one becomes "Save point".
pub fn save_point(
    root: &Path,
    message: &str,
    paths: Option<&[String]>,
) -> Result<SavePoint, GitError> {
    if !is_enabled(root) {
        return Err(GitError::invalid("history is off for this vault"));
    }
    let trimmed = message.trim();
    let text: String = if trimmed.is_empty() {
        "Save point".to_string()
    } else {
        trimmed.chars().take(MAX_MESSAGE_CHARS).collect()
    };
    let checked: Vec<String> = match paths {
        Some([]) => {
            return Err(GitError::invalid("choose at least one file to save"));
        }
        Some(list) => list
            .iter()
            .map(|p| git_ops::checked_path(p))
            .collect::<Result<_, _>>()?,
        None => vec![".".to_string()],
    };
    if status(root)?.changes.is_empty() {
        return Ok(SavePoint {
            saved: false,
            commit: None,
            status: status(root)?,
        });
    }
    let mut add: Vec<&str> = vec!["add", "-A", "--"];
    add.extend(checked.iter().map(String::as_str));
    git_ops::run_long(root, &add, None)?;
    // Only what was just added is staged (the app never stages anything else),
    // so a commit of the index is a save point of exactly those files.
    let staged = git_ops::run(root, &["diff", "--cached", "--name-only", "-z"], None, true)?;
    if staged.is_empty() {
        return Ok(SavePoint {
            saved: false,
            commit: None,
            status: status(root)?,
        });
    }
    let message = format!("{text}\n");
    git_ops::run(
        root,
        &["commit", "-q", "-F", "-"],
        Some(message.as_bytes()),
        false,
    )?;
    let id = git_ops::run(root, &["rev-parse", "--short", "HEAD"], None, true)?;
    Ok(SavePoint {
        saved: true,
        commit: Some(String::from_utf8_lossy(&id).trim().to_string()),
        status: status(root)?,
    })
}

/// One save point in the history list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: String,
    pub short_id: String,
    pub author: String,
    /// ISO 8601 time of the save point.
    pub date: String,
    /// Parent ids (two for a merge), for the history graph.
    pub parents: Vec<String>,
    /// Branch names pointing at this save point ("main", "try-out").
    pub branches: Vec<String>,
    /// True for the save point the vault is on now.
    pub head: bool,
    /// The first line of the description.
    pub subject: String,
    /// The rest of the description ("" when there is none).
    pub body: String,
    pub files_changed: u32,
    /// In a one-file history: the file's path at this save point (it may have
    /// been renamed since). None in the vault-wide list.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Log {
    pub entries: Vec<LogEntry>,
    /// True when older save points follow (ask again with a larger `skip`).
    pub has_more: bool,
}

/// The longest page of history one call returns.
const MAX_LOG_PAGE: u32 = 200;
const RECORD: char = '\u{1e}';

/// Parse `git log --format=<RECORD>%H%x00%h%x00%an%x00%aI%x00%P%x00%D%x00%s%x00%b%x00 --shortstat`.
pub fn parse_log(out: &[u8]) -> Vec<LogEntry> {
    let text = String::from_utf8_lossy(out);
    text.split(RECORD)
        .filter(|r| !r.trim().is_empty())
        .filter_map(|record| {
            let mut f = record.split('\0');
            let id = f.next()?.trim().to_string();
            let short_id = f.next()?.to_string();
            let author = f.next()?.to_string();
            let date = f.next()?.to_string();
            let parents = f.next()?.split_whitespace().map(str::to_string).collect();
            // Only branch names are decorated (--decorate-refs=refs/heads/).
            let mut head = false;
            let mut branches = Vec::new();
            for d in f
                .next()?
                .split(", ")
                .map(str::trim)
                .filter(|d| !d.is_empty())
            {
                if d == "HEAD" {
                    head = true;
                } else if let Some(name) = d.strip_prefix("HEAD -> ") {
                    head = true;
                    branches.push(name.to_string());
                } else {
                    branches.push(d.to_string());
                }
            }
            let subject = f.next()?.to_string();
            let body = f.next()?.trim().to_string();
            let stat = f.next().unwrap_or("");
            let files_changed = stat
                .split_whitespace()
                .next()
                .and_then(|n| n.parse().ok())
                .unwrap_or(0);
            Some(LogEntry {
                id,
                short_id,
                author,
                date,
                parents,
                branches,
                head,
                subject,
                body,
                files_changed,
                path: None,
            })
        })
        .collect()
}

/// A page of save points, newest first, on the current branch. With `path`,
/// only those that changed that file (following renames).
pub fn log(
    root: &Path,
    path: Option<&str>,
    skip: u32,
    limit: u32,
    all_branches: bool,
) -> Result<Log, GitError> {
    if !is_enabled(root) {
        return Err(GitError::invalid("history is off for this vault"));
    }
    let limit = limit.clamp(1, MAX_LOG_PAGE);
    let count = format!("-n{}", limit + 1);
    let skip = format!("--skip={skip}");
    let format = format!("--format={RECORD}%H%x00%h%x00%an%x00%aI%x00%P%x00%D%x00%s%x00%b%x00");
    let checked = path.map(git_ops::checked_path).transpose()?;
    let mut args = vec![
        "log",
        &count,
        &skip,
        &format,
        "--shortstat",
        "--decorate=short",
        "--decorate-refs=refs/heads/",
        "--decorate-refs=HEAD",
    ];
    if all_branches && path.is_none() {
        // Every branch, children before parents, for the graph.
        args.push("--branches");
        args.push("--topo-order");
    }
    if checked.is_some() {
        args.push("--follow");
    }
    args.push("--");
    if let Some(p) = checked.as_deref() {
        args.push(p);
    }
    let out = match git_ops::run(root, &args, None, true) {
        Ok(out) => out,
        // A brand-new repo has no save points yet.
        Err(e) if e.message.contains("does not have any commits") => Vec::new(),
        Err(e) => return Err(e),
    };
    let mut entries = parse_log(&out);
    let has_more = entries.len() > limit as usize;
    entries.truncate(limit as usize);
    if let Some(p) = checked.as_deref() {
        // The file's name at each save point, following renames.
        let names = git_ops::run(
            root,
            &[
                "log",
                &count,
                &skip,
                "--follow",
                "--name-only",
                &format!("--format={RECORD}%H"),
                "--",
                p,
            ],
            None,
            true,
        )?;
        let text = String::from_utf8_lossy(&names).to_string();
        for record in text.split(RECORD).filter(|r| !r.trim().is_empty()) {
            let mut lines = record.lines().map(str::trim).filter(|l| !l.is_empty());
            if let (Some(id), Some(name)) = (lines.next(), lines.next())
                && let Some(entry) = entries.iter_mut().find(|e| e.id == id)
            {
                entry.path = Some(name.to_string());
            }
        }
    }
    Ok(Log { entries, has_more })
}

/// The most a stored version may be to be shown (bytes).
const MAX_SHOW_BYTES: usize = 25 * 1024 * 1024;

/// A file's text as it was at a save point.
pub fn show(root: &Path, commit: &str, path: &str) -> Result<String, GitError> {
    if !is_enabled(root) {
        return Err(GitError::invalid("history is off for this vault"));
    }
    let commit = git_ops::checked_commit(commit)?;
    let path = git_ops::checked_path(path)?;
    // `<commit>:<path>` starts with hex, so git never reads it as an option.
    let out = git_ops::run(root, &["show", &format!("{commit}:{path}")], None, true)?;
    if out.len() > MAX_SHOW_BYTES {
        return Err(GitError::invalid("this version is too large to show"));
    }
    String::from_utf8(out).map_err(|_| GitError::invalid("this version is not text"))
}

/// One branch of the vault's history.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    /// The branch the vault is on now.
    pub current: bool,
    /// Its newest save point's short id and description.
    pub short_id: String,
    pub subject: String,
}

fn enabled(root: &Path) -> Result<(), GitError> {
    if is_enabled(root) {
        Ok(())
    } else {
        Err(GitError::invalid("history is off for this vault"))
    }
}

/// Every branch, the current one marked.
pub fn branches(root: &Path) -> Result<Vec<Branch>, GitError> {
    enabled(root)?;
    let out = git_ops::run(
        root,
        &[
            "for-each-ref",
            "--format=%(refname:short)%00%(HEAD)%00%(objectname:short)%00%(subject)",
            "refs/heads/",
        ],
        None,
        true,
    )?;
    Ok(String::from_utf8_lossy(&out)
        .lines()
        .filter_map(|line| {
            let mut f = line.split('\0');
            Some(Branch {
                name: f.next()?.to_string(),
                current: f.next()? == "*",
                short_id: f.next()?.to_string(),
                subject: f.next().unwrap_or("").to_string(),
            })
        })
        .collect())
}

fn branch_exists(root: &Path, name: &str) -> Result<bool, GitError> {
    Ok(branches(root)?
        .iter()
        .any(|b| b.name.eq_ignore_ascii_case(name)))
}

/// Unsaved changes would ride along to (or clash with) another branch, so
/// switching only happens from a clean state.
fn require_clean(root: &Path) -> Result<(), GitError> {
    if status(root)?.changes.is_empty() {
        Ok(())
    } else {
        Err(GitError::invalid(
            "make a save point first: switching branches needs every change saved in history",
        ))
    }
}

/// A new branch at the current save point; switched to when `switch_to` is true.
pub fn create_branch(root: &Path, name: &str, switch_to: bool) -> Result<Status, GitError> {
    enabled(root)?;
    let name = git_ops::checked_branch(name)?;
    if branch_exists(root, name)? {
        return Err(GitError::invalid(
            "there is already a branch with this name",
        ));
    }
    if switch_to {
        require_clean(root)?;
        git_ops::run(root, &["switch", "-q", "-c", name], None, false)?;
    } else {
        git_ops::run(root, &["branch", name], None, false)?;
    }
    status(root)
}

/// Move the vault to another branch: every note becomes that branch's version.
pub fn switch_branch(root: &Path, name: &str) -> Result<Status, GitError> {
    enabled(root)?;
    let name = git_ops::checked_branch(name)?;
    if !branch_exists(root, name)? {
        return Err(GitError::invalid("there is no branch with this name"));
    }
    require_clean(root)?;
    git_ops::run_long(root, &["switch", "-q", name], None)?;
    status(root)
}

pub fn rename_branch(root: &Path, from: &str, to: &str) -> Result<Vec<Branch>, GitError> {
    enabled(root)?;
    let from = git_ops::checked_branch(from)?;
    let to = git_ops::checked_branch(to)?;
    if !branch_exists(root, from)? {
        return Err(GitError::invalid("there is no branch with this name"));
    }
    if !from.eq_ignore_ascii_case(to) && branch_exists(root, to)? {
        return Err(GitError::invalid(
            "there is already a branch with this name",
        ));
    }
    git_ops::run(root, &["branch", "-m", from, to], None, false)?;
    branches(root)
}

/// Delete a branch whose save points are all merged somewhere (git's safe
/// delete). The current branch, and one with unmerged save points, are kept.
pub fn delete_branch(root: &Path, name: &str) -> Result<Vec<Branch>, GitError> {
    enabled(root)?;
    let name = git_ops::checked_branch(name)?;
    let list = branches(root)?;
    match list.iter().find(|b| b.name == name) {
        None => return Err(GitError::invalid("there is no branch with this name")),
        Some(b) if b.current => {
            return Err(GitError::invalid(
                "switch to another branch before deleting this one",
            ));
        }
        Some(_) => {}
    }
    match git_ops::run(root, &["branch", "-d", name], None, false) {
        Ok(_) => branches(root),
        Err(e) if e.message.contains("not fully merged") => Err(GitError::invalid(
            "this branch has save points that aren't merged into another branch, so it was kept",
        )),
        Err(e) => Err(e),
    }
}

/// What starting a merge did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeStart {
    /// Nothing to merge: the current branch already has everything.
    pub up_to_date: bool,
    /// Files changed on both sides, still holding the current branch's version.
    /// Notes among them are merged block by block by the app.
    pub conflicted: Vec<String>,
    /// Every file the merge changes (including the conflicted ones).
    pub changed: Vec<String>,
}

fn nul_list(out: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(out)
        .split('\0')
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

fn require_merging(root: &Path) -> Result<(), GitError> {
    if root.join(".git/MERGE_HEAD").is_file() {
        Ok(())
    } else {
        Err(GitError::invalid("no merge is in progress"))
    }
}

/// Start merging `branch` into the current branch, without making the save
/// point yet. Git never line-merges notes (`*.vnote -merge`), so a note
/// changed on both sides keeps the current branch's version and is listed in
/// `conflicted` for the app to merge.
pub fn merge_start(root: &Path, branch: &str) -> Result<MergeStart, GitError> {
    enabled(root)?;
    let name = git_ops::checked_branch(branch)?;
    let list = branches(root)?;
    match list.iter().find(|b| b.name == name) {
        None => return Err(GitError::invalid("there is no branch with this name")),
        Some(b) if b.current => {
            return Err(GitError::invalid("choose another branch to merge in"));
        }
        Some(_) => {}
    }
    if root.join(".git/MERGE_HEAD").is_file() {
        return Err(GitError::invalid(
            "a merge is already in progress; finish or cancel it first",
        ));
    }
    require_clean(root)?;
    let result = git_ops::run_long(root, &["merge", "--no-commit", "--no-ff", name], None);
    let merging = root.join(".git/MERGE_HEAD").is_file();
    if let Err(e) = result {
        // Conflicts leave a merge in progress; anything else is a real failure.
        if !merging {
            return Err(e);
        }
    }
    if !merging {
        return Ok(MergeStart {
            up_to_date: true,
            conflicted: Vec::new(),
            changed: Vec::new(),
        });
    }
    let conflicted = nul_list(&git_ops::run(
        root,
        &["diff", "--name-only", "-z", "--diff-filter=U"],
        None,
        true,
    )?);
    let mut changed = nul_list(&git_ops::run(
        root,
        &["diff", "--cached", "--name-only", "-z", "HEAD"],
        None,
        true,
    )?);
    for path in &conflicted {
        if !changed.contains(path) {
            changed.push(path.clone());
        }
    }
    Ok(MergeStart {
        up_to_date: false,
        conflicted,
        changed,
    })
}

/// The three versions of a conflicted file during a merge: the common base,
/// the current branch's (mine) and the merged branch's (theirs). A missing one
/// (added or deleted on a side) is None.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeStages {
    pub base: Option<String>,
    pub mine: Option<String>,
    pub theirs: Option<String>,
}

pub fn merge_stages(root: &Path, path: &str) -> Result<MergeStages, GitError> {
    require_merging(root)?;
    let path = git_ops::checked_path(path)?;
    let stage = |n: u8| {
        git_ops::run(root, &["show", &format!(":{n}:{path}")], None, true)
            .ok()
            .and_then(|out| String::from_utf8(out).ok())
    };
    Ok(MergeStages {
        base: stage(1),
        mine: stage(2),
        theirs: stage(3),
    })
}

/// Mark files as resolved after the app wrote (or removed) their merged result.
pub fn merge_mark_resolved(root: &Path, paths: &[String]) -> Result<Status, GitError> {
    require_merging(root)?;
    if paths.is_empty() {
        return status(root);
    }
    let checked: Vec<String> = paths
        .iter()
        .map(|p| git_ops::checked_path(p))
        .collect::<Result<_, _>>()?;
    let mut args = vec!["add", "-A", "--"];
    args.extend(checked.iter().map(String::as_str));
    git_ops::run(root, &args, None, false)?;
    status(root)
}

/// Make the merge's save point. Refused while any file is still unresolved.
pub fn merge_finish(root: &Path, message: &str) -> Result<Status, GitError> {
    require_merging(root)?;
    let unresolved = nul_list(&git_ops::run(
        root,
        &["diff", "--name-only", "-z", "--diff-filter=U"],
        None,
        true,
    )?);
    if !unresolved.is_empty() {
        return Err(GitError::invalid("some files are not merged yet"));
    }
    let text = match message.trim() {
        "" => "Merge".to_string(),
        t => t.chars().take(MAX_MESSAGE_CHARS).collect(),
    };
    let message = format!("{text}\n");
    git_ops::run(
        root,
        &["commit", "-q", "-F", "-"],
        Some(message.as_bytes()),
        false,
    )?;
    status(root)
}

/// Cancel a merge: every file goes back to the current branch's last save point.
pub fn merge_abort(root: &Path) -> Result<Status, GitError> {
    require_merging(root)?;
    git_ops::run(root, &["merge", "--abort"], None, false)?;
    status(root)
}

/// What restoring the vault to a save point did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultRestore {
    /// Files that existed at the save point, now back to how they were then.
    pub restored: u32,
    /// Files created after it, still in the vault (the app may move notes among
    /// them to the trash when asked).
    pub newer: Vec<String>,
    pub status: Status,
}

/// Put every file that existed at `commit` back to how it was then. Files
/// created later are kept and listed. Nothing is committed: the caller makes
/// the "Restored to …" save point. Refused while anything is unsaved.
pub fn restore_vault(root: &Path, commit: &str) -> Result<VaultRestore, GitError> {
    enabled(root)?;
    let commit = git_ops::checked_commit(commit)?;
    require_clean(root)?;
    let then = nul_list(&git_ops::run(
        root,
        &["ls-tree", "-r", "-z", "--name-only", commit],
        None,
        true,
    )?);
    let now = nul_list(&git_ops::run(root, &["ls-files", "-z"], None, true)?);
    if !then.is_empty() {
        // The paths go on stdin, so no file name is ever read as an option.
        let list = then.join("\0");
        git_ops::run_long(
            root,
            &[
                "checkout",
                commit,
                "--pathspec-from-file=-",
                "--pathspec-file-nul",
            ],
            Some(list.as_bytes()),
        )?;
    }
    let newer = now.into_iter().filter(|p| !then.contains(p)).collect();
    Ok(VaultRestore {
        restored: then.len() as u32,
        newer,
        status: status(root)?,
    })
}

/// Undo one save point with a new save point that reverses it. If later save
/// points changed the same files, nothing is changed and the reason is given.
pub fn undo_save_point(root: &Path, commit: &str) -> Result<Status, GitError> {
    enabled(root)?;
    let commit = git_ops::checked_commit(commit)?;
    require_clean(root)?;
    let parents = git_ops::run(root, &["log", "-1", "--format=%P", commit], None, true)?;
    if String::from_utf8_lossy(&parents).split_whitespace().count() != 1 {
        return Err(GitError::invalid(
            "this save point can't be undone on its own (it is a merge or the first one)",
        ));
    }
    if let Err(e) = git_ops::run(root, &["revert", "--no-edit", commit], None, false) {
        let _ = git_ops::run(root, &["revert", "--abort"], None, false);
        return Err(
            if e.message.contains("conflict") || e.message.contains("could not revert") {
                GitError::invalid(
                    "later save points changed the same notes, so this one can't be undone automatically; restore the notes from their History instead",
                )
            } else {
                e
            },
        );
    }
    status(root)
}

/// A display name for save points: trimmed, 1 to 80 characters, no control
/// characters or `<>` (git uses them around the email).
pub fn checked_name(raw: &str) -> Result<String, GitError> {
    let name = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let ok = !name.is_empty()
        && name.chars().count() <= 80
        && !name.chars().any(|c| c.is_control() || c == '<' || c == '>');
    if ok {
        Ok(name)
    } else {
        Err(GitError::invalid("give a name of 1 to 80 characters"))
    }
}

/// The email shown on save points: the name as `letters-and-digits@vaultops.local`.
fn local_email(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let slug = slug.trim_matches('-');
    let slug = if slug.is_empty() { "me" } else { slug };
    format!("{slug}@vaultops.local")
}

fn write_new_or_keep(path: &Path, text: &str) -> Result<(), GitError> {
    if path.exists() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| GitError::io("could not create a folder"))?;
    }
    std::fs::write(path, text).map_err(|_| GitError::io("could not write a history file"))
}

/// Settings that live in `.git` (not synced): re-applied whenever the vault
/// opens, so a copy cloned elsewhere gets them too.
pub fn apply_local_settings(root: &Path) -> Result<(), GitError> {
    if !is_enabled(root) {
        return Ok(());
    }
    let attributes = root.join(ATTRIBUTES_FILE);
    let current = std::fs::read_to_string(&attributes).unwrap_or_default();
    if !current.contains("*.vnote -merge") {
        if let Some(parent) = attributes.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|_| GitError::io("could not create a folder"))?;
        }
        std::fs::write(&attributes, format!("{current}{ATTRIBUTES}"))
            .map_err(|_| GitError::io("could not write git attributes"))?;
    }
    for (key, value) in [
        ("core.precomposeunicode", "true"),
        ("core.quotepath", "false"),
    ] {
        git_ops::run(root, &["config", key, value], None, false)?;
    }
    Ok(())
}

/// Turn history on: a new repo on branch `main` with the vault's ignore rules,
/// the local settings, the person's name, and a first save point of everything.
pub fn enable(root: &Path, raw_name: &str) -> Result<Status, GitError> {
    let name = checked_name(raw_name)?;
    if is_enabled(root) {
        return Err(GitError::invalid("history is already on for this vault"));
    }
    if root.join(".git").exists() {
        return Err(GitError::invalid(
            "this vault folder already is a git repository, so VaultOps left it alone",
        ));
    }
    let run = |args: &[&str], stdin: Option<&[u8]>| git_ops::run(root, args, stdin, false);
    run(&["-c", "init.defaultBranch=main", "init", "-q"], None)?;
    run(&["config", "user.name", &name], None)?;
    run(&["config", "user.email", &local_email(&name)], None)?;
    std::fs::write(root.join(MARKER), "1\n")
        .map_err(|_| GitError::io("could not mark the history"))?;
    write_new_or_keep(&root.join(IGNORE_FILE), IGNORE_RULES)?;
    apply_local_settings(root)?;
    git_ops::run_long(root, &["add", "-A", "--", "."], None)?;
    run(
        &["commit", "-q", "--allow-empty", "-F", "-"],
        Some(b"History turned on\n"),
    )?;
    status(root)
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

    fn enabled_vault() -> TempDir {
        let dir = TempDir::new();
        std::fs::write(dir.path().join("a.vnote"), "x").unwrap();
        std::fs::create_dir_all(dir.path().join(".vaultops/recovery")).unwrap();
        std::fs::write(dir.path().join(".vaultops/recovery/old.vnote"), "y").unwrap();
        std::fs::create_dir_all(dir.path().join(".vaultops/trash/t1")).unwrap();
        std::fs::write(dir.path().join(".vaultops/trash/t1/b.vnote"), "z").unwrap();
        enable(dir.path(), "  Sam   Rivera ").unwrap();
        dir
    }

    fn git_out(root: &Path, args: &[&str]) -> String {
        String::from_utf8_lossy(&git_ops::run(root, args, None, true).unwrap())
            .trim()
            .to_string()
    }

    #[test]
    fn turning_history_on_takes_a_first_save_point_with_the_rules() {
        let dir = enabled_vault();
        let root = dir.path();
        let s = status(root).unwrap();
        assert!(s.enabled);
        assert_eq!(s.branch.as_deref(), Some("main"));
        assert!(s.changes.is_empty(), "{:?}", s.changes);
        let files = git_out(root, &["ls-files"]);
        assert!(files.contains("a.vnote"));
        assert!(files.contains(".vaultops/.gitignore"));
        assert!(files.contains(".vaultops/trash/t1/b.vnote"));
        assert!(!files.contains("recovery"));
        assert_eq!(
            git_out(root, &["log", "-1", "--format=%s"]),
            "History turned on"
        );
        assert_eq!(
            git_out(root, &["log", "-1", "--format=%an <%ae>"]),
            "Sam Rivera <sam-rivera@vaultops.local>"
        );
        let attributes = std::fs::read_to_string(root.join(ATTRIBUTES_FILE)).unwrap();
        assert!(attributes.contains("*.vnote -merge"));
    }

    #[test]
    fn refuses_twice_a_bad_name_and_someone_elses_repo() {
        let dir = enabled_vault();
        assert!(enable(dir.path(), "Sam").is_err());
        let other = TempDir::new();
        assert_eq!(
            checked_name("  ").unwrap_err().code,
            GitErrorCode::InvalidArgument
        );
        assert!(checked_name("Sam <x>").is_err());
        git_ops::run(other.path(), &["init", "-q"], None, false).unwrap();
        let s = status(other.path()).unwrap();
        assert!(!s.enabled && s.other_repo);
        assert!(enable(other.path(), "Sam").is_err());
    }

    #[test]
    fn local_settings_come_back_after_they_are_lost() {
        let dir = enabled_vault();
        std::fs::remove_file(dir.path().join(ATTRIBUTES_FILE)).unwrap();
        apply_local_settings(dir.path()).unwrap();
        assert!(
            std::fs::read_to_string(dir.path().join(ATTRIBUTES_FILE))
                .unwrap()
                .contains("*.vnote -merge")
        );
    }

    #[test]
    fn names_the_cloud_service_syncing_the_folder() {
        assert_eq!(
            synced_folder(Path::new(
                "/Users/a/Library/Mobile Documents/com~apple~CloudDocs/V"
            )),
            Some("iCloud Drive")
        );
        assert_eq!(
            synced_folder(Path::new("/Users/a/Dropbox/V")),
            Some("Dropbox")
        );
        assert_eq!(synced_folder(Path::new("/Users/a/Notes")), None);
        assert_eq!(local_email("Zoë O'Neil"), "zo--o-neil@vaultops.local");
    }

    #[test]
    fn a_save_point_saves_everything_or_only_the_chosen_files() {
        let dir = enabled_vault();
        let root = dir.path();
        std::fs::write(root.join("a.vnote"), "changed").unwrap();
        std::fs::write(root.join("b.vnote"), "new").unwrap();
        let only_b = save_point(root, "Just b", Some(&["b.vnote".to_string()])).unwrap();
        assert!(only_b.saved);
        assert_eq!(git_out(root, &["log", "-1", "--format=%s"]), "Just b");
        assert_eq!(
            only_b
                .status
                .changes
                .iter()
                .map(|c| c.path.as_str())
                .collect::<Vec<_>>(),
            vec!["a.vnote"]
        );
        let all = save_point(root, "   ", None).unwrap();
        assert!(all.saved && all.status.changes.is_empty());
        assert_eq!(git_out(root, &["log", "-1", "--format=%s"]), "Save point");
        assert_eq!(
            all.commit.unwrap(),
            git_out(root, &["rev-parse", "--short", "HEAD"])
        );
    }

    #[test]
    fn nothing_to_save_makes_no_save_point_and_bad_paths_are_refused() {
        let dir = enabled_vault();
        let root = dir.path();
        let before = git_out(root, &["rev-parse", "HEAD"]);
        let none = save_point(root, "Nothing", None).unwrap();
        assert!(!none.saved && none.commit.is_none());
        assert_eq!(git_out(root, &["rev-parse", "HEAD"]), before);
        std::fs::write(root.join("a.vnote"), "changed").unwrap();
        for bad in ["../x", "/etc/passwd", "-p"] {
            let err = save_point(root, "x", Some(&[bad.to_string()]));
            assert!(err.is_err(), "{bad}");
        }
        assert!(save_point(root, "x", Some(&[])).is_err());
        let off = TempDir::new();
        assert!(save_point(off.path(), "x", None).is_err());
    }

    #[test]
    fn lists_save_points_newest_first_in_pages_and_per_file() {
        let dir = enabled_vault();
        let root = dir.path();
        std::fs::write(root.join("a.vnote"), "two").unwrap();
        save_point(root, "Edited a\n\nMore words", None).unwrap();
        std::fs::write(root.join("b.vnote"), "new").unwrap();
        save_point(root, "Added b", None).unwrap();
        let all = log(root, None, 0, 50, false).unwrap();
        let subjects: Vec<_> = all.entries.iter().map(|e| e.subject.as_str()).collect();
        assert_eq!(subjects, vec!["Added b", "Edited a", "History turned on"]);
        assert!(!all.has_more);
        let edited = &all.entries[1];
        assert_eq!(edited.body, "More words");
        assert_eq!(edited.files_changed, 1);
        assert_eq!(edited.author, "Sam Rivera");
        assert_eq!(edited.parents, vec![all.entries[2].id.clone()]);
        assert!(all.entries[2].parents.is_empty());
        let page = log(root, None, 1, 1, false).unwrap();
        assert_eq!(page.entries[0].subject, "Edited a");
        assert!(page.has_more);
        let of_a = log(root, Some("a.vnote"), 0, 50, false).unwrap();
        assert_eq!(
            of_a.entries
                .iter()
                .map(|e| e.subject.as_str())
                .collect::<Vec<_>>(),
            vec!["Edited a", "History turned on"]
        );
        assert!(log(root, Some("../x"), 0, 5, false).is_err());
        assert_eq!(all.entries[0].branches, vec!["main"]);
        assert!(all.entries[0].head && !all.entries[1].head);
    }

    #[test]
    fn lists_every_branch_for_the_graph() {
        let dir = enabled_vault();
        let root = dir.path();
        git_ops::run(root, &["branch", "try-out"], None, false).unwrap();
        std::fs::write(root.join("a.vnote"), "on main").unwrap();
        save_point(root, "Main work", None).unwrap();
        git_ops::run(root, &["switch", "-q", "try-out"], None, false).unwrap();
        std::fs::write(root.join("b.vnote"), "on try-out").unwrap();
        save_point(root, "Try-out work", None).unwrap();
        let current = log(root, None, 0, 50, false).unwrap();
        assert_eq!(current.entries.len(), 2);
        let all = log(root, None, 0, 50, true).unwrap();
        let mut subjects: Vec<_> = all.entries.iter().map(|e| e.subject.as_str()).collect();
        subjects.sort();
        assert_eq!(
            subjects,
            vec!["History turned on", "Main work", "Try-out work"]
        );
        let tip = all
            .entries
            .iter()
            .find(|e| e.subject == "Try-out work")
            .unwrap();
        assert_eq!(tip.branches, vec!["try-out"]);
        assert!(tip.head);
        assert_eq!(all.entries.last().unwrap().subject, "History turned on");
    }

    #[test]
    fn shows_a_file_as_it_was_and_follows_renames() {
        let dir = enabled_vault();
        let root = dir.path();
        let first = git_out(root, &["rev-parse", "HEAD"]);
        std::fs::write(root.join("a.vnote"), "two").unwrap();
        save_point(root, "Edited", None).unwrap();
        std::fs::rename(root.join("a.vnote"), root.join("Renamed.vnote")).unwrap();
        save_point(root, "Renamed", None).unwrap();
        assert_eq!(show(root, &first, "a.vnote").unwrap(), "x");
        let history = log(root, Some("Renamed.vnote"), 0, 10, false).unwrap();
        let paths: Vec<_> = history
            .entries
            .iter()
            .map(|e| (e.subject.as_str(), e.path.as_deref()))
            .collect();
        assert_eq!(
            paths,
            vec![
                ("Renamed", Some("Renamed.vnote")),
                ("Edited", Some("a.vnote")),
                ("History turned on", Some("a.vnote")),
            ]
        );
        assert!(show(root, "--output=/tmp/x", "a.vnote").is_err());
        assert!(show(root, &first, "../etc").is_err());
        assert!(show(root, &first, "missing.vnote").is_err());
    }

    #[test]
    fn creates_switches_renames_and_deletes_branches_safely() {
        let dir = enabled_vault();
        let root = dir.path();
        create_branch(root, "try-out", true).unwrap();
        std::fs::write(root.join("a.vnote"), "try-out text").unwrap();
        // Unsaved changes block a switch.
        assert!(switch_branch(root, "main").is_err());
        save_point(root, "On try-out", None).unwrap();
        switch_branch(root, "main").unwrap();
        assert_eq!(std::fs::read_to_string(root.join("a.vnote")).unwrap(), "x");
        let list = branches(root).unwrap();
        let names: Vec<_> = list.iter().map(|b| (b.name.as_str(), b.current)).collect();
        assert_eq!(names, vec![("main", true), ("try-out", false)]);
        assert_eq!(list[1].subject, "On try-out");
        // Unmerged work is kept, and the current branch can't be deleted.
        assert!(
            delete_branch(root, "try-out")
                .unwrap_err()
                .message
                .contains("kept")
        );
        assert!(delete_branch(root, "main").is_err());
        rename_branch(root, "try-out", "essay-v2").unwrap();
        assert!(branches(root).unwrap().iter().any(|b| b.name == "essay-v2"));
        create_branch(root, "empty", false).unwrap();
        assert!(create_branch(root, "Empty", false).is_err());
        assert_eq!(delete_branch(root, "empty").unwrap().len(), 2);
        for bad in ["-d", "a..b", "x y"] {
            assert!(create_branch(root, bad, false).is_err(), "{bad}");
        }
        assert!(switch_branch(root, "nope").is_err());
    }

    fn diverged() -> TempDir {
        let dir = enabled_vault();
        let root = dir.path();
        std::fs::write(root.join("keep.vnote"), "k").unwrap();
        save_point(root, "base", None).unwrap();
        create_branch(root, "try-out", true).unwrap();
        std::fs::write(root.join("a.vnote"), "theirs").unwrap();
        std::fs::write(root.join("new.vnote"), "new").unwrap();
        save_point(root, "try-out work", None).unwrap();
        switch_branch(root, "main").unwrap();
        std::fs::write(root.join("a.vnote"), "mine").unwrap();
        std::fs::remove_file(root.join("keep.vnote")).unwrap();
        save_point(root, "main work", None).unwrap();
        dir
    }

    #[test]
    fn a_merge_lists_notes_changed_on_both_sides_and_finishes_once_resolved() {
        let dir = diverged();
        let root = dir.path();
        let started = merge_start(root, "try-out").unwrap();
        assert!(!started.up_to_date);
        assert_eq!(started.conflicted, vec!["a.vnote"]);
        assert!(started.changed.contains(&"new.vnote".to_string()));
        // Git left mine in place, with no conflict markers.
        assert_eq!(
            std::fs::read_to_string(root.join("a.vnote")).unwrap(),
            "mine"
        );
        assert!(status(root).unwrap().merging);
        let stages = merge_stages(root, "a.vnote").unwrap();
        assert_eq!(
            (
                stages.base.as_deref(),
                stages.mine.as_deref(),
                stages.theirs.as_deref()
            ),
            (Some("x"), Some("mine"), Some("theirs"))
        );
        assert!(merge_finish(root, "Merged").is_err());
        std::fs::write(root.join("a.vnote"), "merged").unwrap();
        merge_mark_resolved(root, &["a.vnote".to_string()]).unwrap();
        let done = merge_finish(root, "Merged try-out into main").unwrap();
        assert!(!done.merging && done.changes.is_empty());
        assert_eq!(
            git_out(root, &["log", "-1", "--format=%P"])
                .split_whitespace()
                .count(),
            2
        );
        assert_eq!(
            git_out(root, &["log", "-1", "--format=%s"]),
            "Merged try-out into main"
        );
        assert_eq!(
            std::fs::read_to_string(root.join("new.vnote")).unwrap(),
            "new"
        );
        assert!(merge_start(root, "try-out").unwrap().up_to_date);
    }

    #[test]
    fn a_merge_can_be_cancelled_and_is_refused_when_it_cannot_start() {
        let dir = diverged();
        let root = dir.path();
        assert!(merge_start(root, "main").is_err());
        assert!(merge_start(root, "nope").is_err());
        assert!(merge_abort(root).is_err());
        merge_start(root, "try-out").unwrap();
        assert!(merge_start(root, "try-out").is_err());
        let back = merge_abort(root).unwrap();
        assert!(!back.merging && back.changes.is_empty());
        assert_eq!(
            std::fs::read_to_string(root.join("a.vnote")).unwrap(),
            "mine"
        );
        assert!(!root.join("new.vnote").exists());
        std::fs::write(root.join("a.vnote"), "unsaved").unwrap();
        assert!(merge_start(root, "try-out").is_err());
        assert!(merge_stages(root, "a.vnote").is_err());
    }

    #[test]
    fn restoring_the_vault_brings_old_files_back_and_keeps_newer_ones() {
        let dir = enabled_vault();
        let root = dir.path();
        let first = git_out(root, &["rev-parse", "HEAD"]);
        std::fs::write(root.join("a.vnote"), "changed").unwrap();
        std::fs::write(root.join("-tricky.vnote"), "new").unwrap();
        std::fs::remove_file(root.join(".vaultops/trash/t1/b.vnote")).unwrap();
        save_point(root, "later", None).unwrap();
        std::fs::write(root.join("a.vnote"), "unsaved").unwrap();
        assert!(restore_vault(root, &first).is_err());
        save_point(root, "even later", None).unwrap();
        let done = restore_vault(root, &first).unwrap();
        assert_eq!(std::fs::read_to_string(root.join("a.vnote")).unwrap(), "x");
        assert!(root.join(".vaultops/trash/t1/b.vnote").exists());
        assert_eq!(done.newer, vec!["-tricky.vnote"]);
        assert!(root.join("-tricky.vnote").exists());
        assert!(!done.status.changes.is_empty());
        assert!(restore_vault(root, "--all").is_err());
    }

    #[test]
    fn undoing_a_save_point_reverses_it_or_refuses_cleanly() {
        let dir = enabled_vault();
        let root = dir.path();
        std::fs::write(root.join("b.vnote"), "added").unwrap();
        save_point(root, "Added b", None).unwrap();
        let added = git_out(root, &["rev-parse", "HEAD"]);
        std::fs::write(root.join("a.vnote"), "one").unwrap();
        save_point(root, "Edit a once", None).unwrap();
        let once = git_out(root, &["rev-parse", "HEAD"]);
        std::fs::write(root.join("a.vnote"), "two").unwrap();
        save_point(root, "Edit a twice", None).unwrap();
        undo_save_point(root, &added).unwrap();
        assert!(!root.join("b.vnote").exists());
        assert!(git_out(root, &["log", "-1", "--format=%s"]).starts_with("Revert"));
        let err = undo_save_point(root, &once).unwrap_err();
        assert!(err.message.contains("can't be undone automatically"));
        let s = status(root).unwrap();
        assert!(s.changes.is_empty() && !s.merging);
        assert_eq!(
            std::fs::read_to_string(root.join("a.vnote")).unwrap(),
            "two"
        );
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
        std::fs::write(root.join(MARKER), "1").unwrap();
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
