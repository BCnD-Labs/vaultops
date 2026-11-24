//! Git for the vault's history: finding a working git, and one runner that
//! every version-control command goes through.
//!
//! Rules (AGENTS.md):
//! - git runs as `Command::new(<git>)` with an argument list, never a shell;
//! - the frontend never sends raw arguments: commands build them from values
//!   checked here, and any path comes after `--`;
//! - hooks, pagers, fsmonitor and credential prompts are off, so running a
//!   command never runs code from the repo or waits for a terminal.
//!
//! On macOS `/usr/bin/git` is a stub that opens Apple's "install developer
//! tools" dialog when the Command Line Tools are missing, so it is only used
//! when `xcode-select -p` says the tools are installed.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::vault::check_relative;

/// How long one git command may run before it is stopped.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(60);
/// For commands that touch every file (the first save point of a big vault).
pub const LONG_TIMEOUT: Duration = Duration::from_secs(600);
/// Only this much of stderr is kept for an error message.
const MAX_ERROR_CHARS: usize = 300;

/// What `vcs_detect` reports to the frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub found: bool,
    /// For example `2.50.1`.
    pub version: Option<String>,
    /// macOS only: git is missing because Apple's Command Line Tools are.
    pub needs_developer_tools: bool,
}

/// A failed git command, safe to show: no absolute paths.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitError {
    pub code: GitErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GitErrorCode {
    /// No working git on this Mac.
    Missing,
    /// A value from the frontend was refused before git ran.
    InvalidArgument,
    /// git ran and failed.
    Failed,
    TimedOut,
    Io,
}

impl GitError {
    fn new(code: GitErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
    pub fn invalid(message: &str) -> Self {
        Self::new(GitErrorCode::InvalidArgument, message)
    }
}

/// The places a real git is looked for, in order.
fn candidates() -> Vec<PathBuf> {
    let mut list = vec![
        PathBuf::from("/Library/Developer/CommandLineTools/usr/bin/git"),
        PathBuf::from("/opt/homebrew/bin/git"),
        PathBuf::from("/usr/local/bin/git"),
    ];
    if cfg!(target_os = "macos") {
        // The stub is safe only when the tools are installed.
        let tools = Command::new("/usr/bin/xcode-select")
            .arg("-p")
            .stdin(Stdio::null())
            .output()
            .ok()
            .filter(|out| out.status.success())
            .map(|out| PathBuf::from(String::from_utf8_lossy(&out.stdout).trim()));
        if let Some(dev) = tools {
            list.insert(0, dev.join("usr/bin/git"));
            list.push(PathBuf::from("/usr/bin/git"));
        }
    } else {
        list.push(PathBuf::from("/usr/bin/git"));
    }
    list
}

/// `git version 2.50.1 (Apple Git-155)` -> `2.50.1`.
fn parse_version(stdout: &str) -> Option<String> {
    let rest = stdout.trim().strip_prefix("git version ")?;
    let version = rest.split_whitespace().next()?;
    version
        .chars()
        .next()
        .filter(char::is_ascii_digit)
        .map(|_| version.to_string())
}

/// The first candidate that runs and answers `--version`, with that version.
pub fn detect_from(candidates: &[PathBuf]) -> Option<(PathBuf, String)> {
    candidates.iter().filter(|p| p.is_file()).find_map(|path| {
        let mut command = Command::new(path);
        command.arg("--version");
        let out = run_command(command, None, Duration::from_secs(10)).ok()?;
        if !out.status.success() {
            return None;
        }
        parse_version(&String::from_utf8_lossy(&out.stdout)).map(|v| (path.clone(), v))
    })
}

static GIT: OnceLock<Option<(PathBuf, String)>> = OnceLock::new();

/// The git this app uses, found once per launch.
pub fn git() -> Option<&'static (PathBuf, String)> {
    GIT.get_or_init(|| detect_from(&candidates())).as_ref()
}

pub fn info() -> GitInfo {
    match git() {
        Some((_, version)) => GitInfo {
            found: true,
            version: Some(version.clone()),
            needs_developer_tools: false,
        },
        None => GitInfo {
            found: false,
            version: None,
            needs_developer_tools: cfg!(target_os = "macos"),
        },
    }
}

/* Checked values */

/// A vault-relative path, checked by the vault's own rules, for use after `--`.
pub fn checked_path(path: &str) -> Result<String, GitError> {
    let parts = check_relative(path, false).map_err(|e| GitError::invalid(e.message))?;
    Ok(parts.join("/"))
}

/// A commit id: 7 to 64 lower-case hex characters.
pub fn checked_commit(id: &str) -> Result<&str, GitError> {
    let ok = (7..=64).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
    if ok {
        Ok(id)
    } else {
        Err(GitError::invalid("not a commit id"))
    }
}

/// A branch name, following the core of `git check-ref-format --branch`.
pub fn checked_branch(name: &str) -> Result<&str, GitError> {
    let bad_char = |c: char| {
        c.is_control() || c.is_whitespace() || matches!(c, '~' | '^' | ':' | '?' | '*' | '[' | '\\')
    };
    let ok = !name.is_empty()
        && name.len() <= 200
        && !name.starts_with('-')
        && !name.starts_with('/')
        && !name.ends_with('/')
        && !name.ends_with('.')
        && !name.ends_with(".lock")
        && !name.contains("..")
        && !name.contains("@{")
        && !name.contains("//")
        && name != "@"
        && !name.split('/').any(|part| part.starts_with('.'))
        && !name.chars().any(bad_char);
    if ok {
        Ok(name)
    } else {
        Err(GitError::invalid("not a usable branch name"))
    }
}

/* Running */

/// Run a command with optional stdin, stopping it after `timeout`.
fn run_command(
    mut command: Command,
    stdin: Option<&[u8]>,
    timeout: Duration,
) -> Result<std::process::Output, GitError> {
    command
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|_| GitError::new(GitErrorCode::Io, "git could not be started"))?;
    if let (Some(bytes), Some(mut pipe)) = (stdin, child.stdin.take()) {
        let bytes = bytes.to_vec();
        thread::spawn(move || {
            let _ = pipe.write_all(&bytes);
        });
    }
    let stdout = reader(child.stdout.take());
    let stderr = reader(child.stderr.take());
    let status = wait(&mut child, timeout)?;
    Ok(std::process::Output {
        status,
        stdout: stdout.join().unwrap_or_default(),
        stderr: stderr.join().unwrap_or_default(),
    })
}

fn reader<R: Read + Send + 'static>(pipe: Option<R>) -> thread::JoinHandle<Vec<u8>> {
    thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut pipe) = pipe {
            let _ = pipe.read_to_end(&mut buf);
        }
        buf
    })
}

fn wait(child: &mut Child, timeout: Duration) -> Result<ExitStatus, GitError> {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(GitError::new(GitErrorCode::TimedOut, "git took too long"));
            }
            Ok(None) => thread::sleep(Duration::from_millis(5)),
            Err(_) => {
                return Err(GitError::new(
                    GitErrorCode::Io,
                    "git could not be waited on",
                ));
            }
        }
    }
}

/// The settings every command starts with: no hooks, pager or fsmonitor.
const BASE_ARGS: &[&str] = &[
    "--no-pager",
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.quotepath=false",
];

/// The full argument list for `args`, with the safe settings first.
pub fn full_args<'a>(args: &[&'a str]) -> Vec<&'a str> {
    BASE_ARGS
        .iter()
        .copied()
        .chain(args.iter().copied())
        .collect()
}

/// Turn git's stderr into a short message without the vault's location.
fn clean_error(stderr: &[u8], root: &Path) -> String {
    let text = String::from_utf8_lossy(stderr);
    let text = text.replace(&*root.to_string_lossy(), "<vault>");
    let line = text
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("git failed");
    line.chars().take(MAX_ERROR_CHARS).collect()
}

/// Run git in `root`. `args` come from the typed commands only. A command
/// that only reads passes `read_only`, so git takes no optional locks.
pub fn run(
    root: &Path,
    args: &[&str],
    stdin: Option<&[u8]>,
    read_only: bool,
) -> Result<Vec<u8>, GitError> {
    let (binary, _) =
        git().ok_or_else(|| GitError::new(GitErrorCode::Missing, "git is not installed"))?;
    run_with(binary, root, args, stdin, read_only, DEFAULT_TIMEOUT)
}

/// The same with a longer time limit, for adding a whole vault at once.
pub fn run_long(root: &Path, args: &[&str], stdin: Option<&[u8]>) -> Result<Vec<u8>, GitError> {
    let (binary, _) =
        git().ok_or_else(|| GitError::new(GitErrorCode::Missing, "git is not installed"))?;
    run_with(binary, root, args, stdin, false, LONG_TIMEOUT)
}

pub fn run_with(
    binary: &Path,
    root: &Path,
    args: &[&str],
    stdin: Option<&[u8]>,
    read_only: bool,
    timeout: Duration,
) -> Result<Vec<u8>, GitError> {
    let mut command = Command::new(binary);
    command
        .args(full_args(args))
        .current_dir(root)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE");
    if read_only {
        command.env("GIT_OPTIONAL_LOCKS", "0");
    }
    let out = run_command(command, stdin, timeout)?;
    if out.status.success() {
        Ok(out.stdout)
    } else {
        Err(GitError::new(
            GitErrorCode::Failed,
            clean_error(&out.stderr, root),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn system_git() -> PathBuf {
        detect_from(&candidates()).expect("tests need git").0
    }

    #[test]
    fn parses_versions_and_rejects_other_output() {
        assert_eq!(
            parse_version("git version 2.50.1 (Apple Git-155)\n").as_deref(),
            Some("2.50.1")
        );
        assert_eq!(
            parse_version("git version 2.43.0").as_deref(),
            Some("2.43.0")
        );
        assert_eq!(
            parse_version("xcode-select: note: no developer tools"),
            None
        );
    }

    #[test]
    fn detects_a_git_and_skips_missing_candidates() {
        let real = system_git();
        let found = detect_from(&[PathBuf::from("/no/such/git"), real.clone()]).unwrap();
        assert_eq!(found.0, real);
        assert!(detect_from(&[PathBuf::from("/no/such/git")]).is_none());
    }

    #[test]
    fn checks_paths_commits_and_branches() {
        assert_eq!(checked_path("Notes/a.vnote").unwrap(), "Notes/a.vnote");
        for bad in ["", "../x", "/etc/passwd", "a/../../b"] {
            assert!(checked_path(bad).is_err(), "{bad}");
        }
        assert!(checked_commit("0123abc").is_ok());
        for bad in ["--all", "HEAD", "0123ABC", "abc", "0123abz"] {
            assert!(checked_commit(bad).is_err(), "{bad}");
        }
        for good in ["main", "try/essay-v2", "feature_1"] {
            assert!(checked_branch(good).is_ok(), "{good}");
        }
        for bad in [
            "-d", "--force", "a..b", "a b", "a~1", "x.lock", "/a", "a/", "a//b", ".hidden", "a/.b",
            "@", "a@{1}", "",
        ] {
            assert!(checked_branch(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn safe_settings_come_before_the_command() {
        let args = full_args(&["log", "--", "-not-an-option.vnote"]);
        assert_eq!(&args[..BASE_ARGS.len()], BASE_ARGS);
        assert_eq!(args[BASE_ARGS.len()], "log");
        assert!(args.contains(&"core.hooksPath=/dev/null"));
    }

    #[test]
    fn runs_git_in_a_folder_and_reports_failures_without_the_path() {
        let git = system_git();
        let dir = crate::test_util::TempDir::new();
        let root = dir.path();
        run_with(
            &git,
            root,
            &["init", "-q", "-b", "main"],
            None,
            false,
            DEFAULT_TIMEOUT,
        )
        .unwrap();
        let out = run_with(
            &git,
            root,
            &["rev-parse", "--is-inside-work-tree"],
            None,
            true,
            DEFAULT_TIMEOUT,
        )
        .unwrap();
        assert_eq!(String::from_utf8_lossy(&out).trim(), "true");
        let err = run_with(&git, root, &["log", "-1"], None, true, DEFAULT_TIMEOUT).unwrap_err();
        assert_eq!(err.code, GitErrorCode::Failed);
        assert!(!err.message.contains(&*root.to_string_lossy()));
    }

    #[test]
    fn passes_stdin_and_never_runs_hooks() {
        let git = system_git();
        let dir = crate::test_util::TempDir::new();
        let root = dir.path();
        let run = |args: &[&str], stdin: Option<&[u8]>| {
            run_with(&git, root, args, stdin, false, DEFAULT_TIMEOUT)
        };
        run(&["init", "-q", "-b", "main"], None).unwrap();
        run(&["config", "user.name", "T"], None).unwrap();
        run(&["config", "user.email", "t@example.com"], None).unwrap();
        // A hook that would leave a marker file if it ran.
        let hook = root.join(".git/hooks/pre-commit");
        std::fs::write(&hook, "#!/bin/sh\ntouch hook-ran\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        std::fs::write(root.join("a.vnote"), "x").unwrap();
        run(&["add", "--", "a.vnote"], None).unwrap();
        run(&["commit", "-q", "-F", "-"], Some(b"First save point\n")).unwrap();
        assert!(!root.join("hook-ran").exists());
        let subject = run(&["log", "-1", "--format=%s"], None).unwrap();
        assert_eq!(String::from_utf8_lossy(&subject).trim(), "First save point");
    }

    #[test]
    fn stops_a_command_that_runs_too_long() {
        let mut command = Command::new("sleep");
        command.arg("5");
        let err = run_command(command, None, Duration::from_millis(100)).unwrap_err();
        assert_eq!(err.code, GitErrorCode::TimedOut);
    }
}
