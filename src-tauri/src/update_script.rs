//! STOPGAP(update-script): the Settings "Update VaultOps" button runs the
//! maintainer's `scripts/install-vaultops.sh` from the code folder this app was
//! built from, until the real in-app updater (#274, #275) can ship. See
//! docs/stopgaps.md.
//!
//! The script builds first and only then asks the app to quit the normal way
//! (which saves the open note), so it never force quits. It is started in its own
//! process group with its output going to a log file in the app's log folder, so
//! it keeps running while the app closes and the new one opens.
//!
//! The same file also answers "is there something newer?" for the two branches
//! the maintainer builds from, `main` and `develop`: it fetches them in the code
//! folder (the only network use, from its existing `origin`) and reads their
//! latest commit. It never changes the working tree or the checked-out branch.

use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;

use crate::host_error::{ErrorCode, HostError};

/// The only two branches the updater knows about, in the order they are shown.
pub const CHANNELS: [&str; 2] = ["main", "develop"];
/// The script, relative to the code folder.
const SCRIPT: &str = "scripts/install-vaultops.sh";
/// The script's output, in the app's log folder. Replaced on every run.
pub const LOG_NAME: &str = "update.log";
/// Only this much of the end of the log is read to find its last line.
const TAIL_WINDOW: u64 = 8 * 1024;
/// A status line never carries more than this many characters.
const MAX_LINE_CHARS: usize = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RunState {
    Idle,
    Running,
    Finished,
    Failed,
}

/// What the window shows: the state and the script's latest line of output.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub state: RunState,
    pub last_line: String,
}

/// Which branch and commit this app was built from, baked in by
/// `scripts/install-vaultops.sh`. A build made any other way says "unknown".
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    pub branch: String,
    pub commit: String,
    pub built_at: String,
}

fn build_info_from(
    branch: Option<&str>,
    commit: Option<&str>,
    built_at: Option<&str>,
) -> BuildInfo {
    let pick = |value: Option<&str>| match value.map(str::trim) {
        Some(text) if !text.is_empty() => text.chars().take(MAX_LINE_CHARS).collect(),
        _ => "unknown".to_string(),
    };
    BuildInfo {
        branch: pick(branch),
        commit: pick(commit),
        built_at: pick(built_at),
    }
}

pub fn build_info() -> BuildInfo {
    build_info_from(
        option_env!("VAULTOPS_BUILD_BRANCH"),
        option_env!("VAULTOPS_BUILD_COMMIT"),
        option_env!("VAULTOPS_BUILD_TIME"),
    )
}

/// What one branch looks like on `origin` after the last fetch.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelInfo {
    pub exists: bool,
    pub commit: String,
    pub short_commit: String,
    pub committed_at: String,
    pub subject: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct Channels {
    pub main: ChannelInfo,
    pub develop: ChannelInfo,
    /// Set when a fetch failed (offline, say); the commits shown are then the
    /// ones fetched last time.
    pub error: Option<String>,
}

/// The one update run this app knows about, if any.
#[derive(Default)]
pub struct UpdateState(Mutex<Option<Child>>);

fn locked(state: &UpdateState) -> Result<std::sync::MutexGuard<'_, Option<Child>>, HostError> {
    state
        .0
        .lock()
        .map_err(|_| HostError::new(ErrorCode::Io, "update state is unavailable"))
}

/// The code folder this app was built from (the folder above `src-tauri`).
pub fn checkout_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default()
}

/// The shell the maintainer's terminal uses, or zsh. A login, interactive shell
/// is used because an app opened from Finder does not get the PATH that npm,
/// node, cargo and git are found through.
fn shell_from(var: Option<&str>) -> String {
    match var {
        Some(shell) if Path::new(shell).is_absolute() => shell.to_string(),
        _ => "/bin/zsh".to_string(),
    }
}

/// A channel name from the window, checked against [`CHANNELS`] exactly (no
/// trimming, no case folding). Returns the allowlisted `&'static str`, so only
/// one of the two fixed names can ever go on.
pub fn channel_from(name: &str) -> Result<&'static str, HostError> {
    CHANNELS
        .iter()
        .copied()
        .find(|c| *c == name)
        .ok_or_else(|| {
            HostError::new(
                ErrorCode::InvalidPath,
                "the update channel must be main or develop",
            )
        })
}

/// The command that runs the script in `root` for one channel. The shell text is
/// fixed: the channel never becomes part of it. It is handed over as the shell's
/// own positional parameter (`$1`, the argument after the `vaultops` name that
/// fills `$0`), so no shell text is ever built from it.
pub fn script_command_with(
    root: &Path,
    shell: &str,
    channel: &'static str,
) -> Result<Command, HostError> {
    if !root.join(SCRIPT).is_file() {
        return Err(HostError::new(
            ErrorCode::NotFound,
            "the update script was not found in the code folder this app was built from",
        ));
    }
    let mut command = Command::new(shell);
    command.current_dir(root).args([
        "-l",
        "-i",
        "-c",
        r#"exec bash scripts/install-vaultops.sh --branch "$1""#,
        "vaultops",
        channel,
    ]);
    Ok(command)
}

pub fn script_command(root: &Path, channel: &str) -> Result<Command, HostError> {
    let channel = channel_from(channel)?;
    let shell = std::env::var("SHELL").ok();
    script_command_with(root, &shell_from(shell.as_deref()), channel)
}

fn spawn(command: &mut Command, log_dir: &Path) -> io::Result<Child> {
    fs::create_dir_all(log_dir)?;
    let log = File::create(log_dir.join(LOG_NAME))?;
    command
        .stdin(Stdio::null())
        .stdout(Stdio::from(log.try_clone()?))
        .stderr(Stdio::from(log));
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command.spawn()
}

/// Start `command` with its output going to the log in `log_dir`. Refused while
/// an earlier run is still going.
pub fn start(state: &UpdateState, mut command: Command, log_dir: &Path) -> Result<(), HostError> {
    let mut run = locked(state)?;
    let running = run
        .as_mut()
        .is_some_and(|child| matches!(child.try_wait(), Ok(None)));
    if running {
        return Err(HostError::new(
            ErrorCode::Io,
            "an update is already running",
        ));
    }
    let child = spawn(&mut command, log_dir).map_err(|e| HostError::from_io(&e))?;
    *run = Some(child);
    Ok(())
}

/// The last non-empty line of the log, trimmed and capped.
fn last_line(log: &Path) -> String {
    let read = || -> io::Result<String> {
        let mut file = File::open(log)?;
        let len = file.metadata()?.len();
        file.seek(SeekFrom::Start(len.saturating_sub(TAIL_WINDOW)))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    };
    read()
        .unwrap_or_default()
        .split(['\n', '\r'])
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(MAX_LINE_CHARS).collect())
        .unwrap_or_default()
}

/// Where the run stands. A run that ended well is `finished` (the script has
/// already opened the new app by then); one that ended badly is `failed`.
pub fn status(state: &UpdateState, log_dir: &Path) -> Result<Status, HostError> {
    let mut run = locked(state)?;
    let Some(child) = run.as_mut() else {
        return Ok(Status {
            state: RunState::Idle,
            last_line: String::new(),
        });
    };
    let run_state = match child.try_wait() {
        Ok(None) => RunState::Running,
        Ok(Some(code)) if code.success() => RunState::Finished,
        _ => RunState::Failed,
    };
    Ok(Status {
        state: run_state,
        last_line: last_line(&log_dir.join(LOG_NAME)),
    })
}

/// Fixed arguments: only a branch name from [`CHANNELS`] ever goes in.
fn fetch_args(branch: &'static str) -> [&'static str; 4] {
    ["fetch", "--quiet", "origin", branch]
}

/// `origin/<branch>`, for the rev to read. Built from the allowlisted names only.
fn remote_ref(branch: &str) -> String {
    format!("origin/{branch}")
}

/// Separates the four fields of the log line (a control character no commit
/// subject has).
const FIELD: char = '\u{1f}';
const LOG_FORMAT: &str = "--format=%H%x1f%h%x1f%cI%x1f%s";

/// Parse the one line `git log -1` printed. `None` when it isn't four fields.
fn parse_log(output: &str) -> Option<ChannelInfo> {
    let mut parts = output.trim_end_matches(['\n', '\r']).splitn(4, FIELD);
    let (commit, short, at, subject) = (parts.next()?, parts.next()?, parts.next()?, parts.next()?);
    if commit.is_empty() {
        return None;
    }
    Some(ChannelInfo {
        exists: true,
        commit: commit.to_string(),
        short_commit: short.to_string(),
        committed_at: at.to_string(),
        subject: subject.chars().take(MAX_LINE_CHARS).collect(),
    })
}

/// A fetch that failed only because the branch isn't on the remote (yet) is not
/// an error: the branch just doesn't exist.
fn branch_is_missing(stderr: &str) -> bool {
    stderr.contains("couldn't find remote ref")
}

fn git(root: &Path) -> Command {
    let mut command = Command::new("git");
    // English messages (branch_is_missing reads them) and no credential prompt.
    command
        .current_dir(root)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0");
    command
}

enum Fetched {
    Done,
    Missing,
    Failed(String),
}

fn fetch(root: &Path, branch: &'static str) -> Fetched {
    match git(root)
        .args(fetch_args(branch))
        .stdin(Stdio::null())
        .output()
    {
        Ok(out) if out.status.success() => Fetched::Done,
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            if branch_is_missing(&stderr) {
                Fetched::Missing
            } else {
                Fetched::Failed(stderr.trim().chars().take(MAX_LINE_CHARS).collect())
            }
        }
        Err(_) => Fetched::Failed("git could not be run".to_string()),
    }
}

fn latest(root: &Path, branch: &str) -> ChannelInfo {
    let rev = remote_ref(branch);
    match git(root)
        .args(["log", "-1", LOG_FORMAT, &rev, "--"])
        .output()
    {
        Ok(out) if out.status.success() => {
            parse_log(&String::from_utf8_lossy(&out.stdout)).unwrap_or_default()
        }
        _ => ChannelInfo::default(),
    }
}

/// Fetch `main` and `develop` from `origin` in `root`, then read each one's
/// latest commit. A branch that is not on the remote is `exists: false`; a failed
/// fetch is reported in `error` while the last known commits are still returned.
pub fn channels_in(root: &Path) -> Channels {
    let mut error = None;
    let mut missing = [false; 2];
    for (i, branch) in CHANNELS.iter().enumerate() {
        match fetch(root, branch) {
            Fetched::Done => {}
            Fetched::Missing => missing[i] = true,
            Fetched::Failed(why) => {
                error.get_or_insert_with(|| {
                    if why.is_empty() {
                        "Could not reach GitHub.".to_string()
                    } else {
                        why
                    }
                });
            }
        }
    }
    let read = |i: usize| {
        if missing[i] {
            ChannelInfo::default()
        } else {
            latest(root, CHANNELS[i])
        }
    };
    Channels {
        main: read(0),
        develop: read(1),
        error,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::TempDir;
    use std::time::{Duration, Instant};

    fn sh(script: &str) -> Command {
        let mut command = Command::new("sh");
        command.args(["-c", script]);
        command
    }

    /// Wait until the run is over (at most a few seconds).
    fn finished(state: &UpdateState, dir: &Path) -> Status {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let status = status(state, dir).unwrap();
            if status.state != RunState::Running || Instant::now() > deadline {
                return status;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn is_idle_before_anything_starts() {
        let tmp = TempDir::new();
        let status = status(&UpdateState::default(), tmp.path()).unwrap();
        assert_eq!(status.state, RunState::Idle);
        assert_eq!(status.last_line, "");
    }

    #[cfg(unix)]
    #[test]
    fn a_run_that_works_is_finished_and_shows_its_last_line() {
        let tmp = TempDir::new();
        let state = UpdateState::default();
        start(&state, sh("echo building; echo all done"), tmp.path()).unwrap();
        let status = finished(&state, tmp.path());
        assert_eq!(status.state, RunState::Finished);
        assert_eq!(status.last_line, "all done");
    }

    #[cfg(unix)]
    #[test]
    fn a_run_that_breaks_is_failed_and_shows_why() {
        let tmp = TempDir::new();
        let state = UpdateState::default();
        start(
            &state,
            sh("echo building; echo 'The app build failed.' >&2; exit 3"),
            tmp.path(),
        )
        .unwrap();
        let status = finished(&state, tmp.path());
        assert_eq!(status.state, RunState::Failed);
        assert_eq!(status.last_line, "The app build failed.");
    }

    #[cfg(unix)]
    #[test]
    fn a_second_start_is_refused_while_one_is_running() {
        let tmp = TempDir::new();
        let state = UpdateState::default();
        start(&state, sh("sleep 30"), tmp.path()).unwrap();
        assert_eq!(status(&state, tmp.path()).unwrap().state, RunState::Running);
        let error = start(&state, sh("echo second"), tmp.path()).unwrap_err();
        assert_eq!(error.message, "an update is already running");
        // Stop the sleeping script so the test leaves nothing behind.
        let mut run = state.0.lock().unwrap();
        let child = run.as_mut().unwrap();
        child.kill().unwrap();
        child.wait().unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_new_run_after_the_old_one_ended_replaces_the_log() {
        let tmp = TempDir::new();
        let state = UpdateState::default();
        start(&state, sh("echo first"), tmp.path()).unwrap();
        assert_eq!(finished(&state, tmp.path()).last_line, "first");
        start(&state, sh("echo second"), tmp.path()).unwrap();
        let status = finished(&state, tmp.path());
        assert_eq!(status.last_line, "second");
        let log = fs::read_to_string(tmp.path().join(LOG_NAME)).unwrap();
        assert!(!log.contains("first"));
    }

    #[test]
    fn the_last_line_skips_blanks_and_progress_returns_and_is_capped() {
        let tmp = TempDir::new();
        let log = tmp.path().join(LOG_NAME);
        fs::write(&log, "first\nProgress 10%\rProgress 90%\r\n\n  \n").unwrap();
        assert_eq!(last_line(&log), "Progress 90%");
        fs::write(&log, "x".repeat(MAX_LINE_CHARS + 50)).unwrap();
        assert_eq!(last_line(&log).chars().count(), MAX_LINE_CHARS);
        assert_eq!(last_line(&tmp.path().join("missing.log")), "");
    }

    #[test]
    fn the_command_runs_the_fixed_script_in_a_login_shell_in_the_code_folder() {
        let tmp = TempDir::new();
        fs::create_dir(tmp.path().join("scripts")).unwrap();
        fs::write(tmp.path().join(SCRIPT), "#!/usr/bin/env bash\n").unwrap();
        let command = script_command_with(tmp.path(), "/bin/zsh", "develop").unwrap();
        assert_eq!(command.get_program(), "/bin/zsh");
        let args: Vec<_> = command.get_args().collect();
        // The shell text is fixed; the channel is its own last argument ($1).
        assert_eq!(
            args,
            [
                "-l",
                "-i",
                "-c",
                r#"exec bash scripts/install-vaultops.sh --branch "$1""#,
                "vaultops",
                "develop",
            ]
        );
        assert_eq!(command.get_current_dir(), Some(tmp.path()));
    }

    #[test]
    fn only_main_and_develop_are_accepted_as_a_channel() {
        assert_eq!(channel_from("main").unwrap(), "main");
        assert_eq!(channel_from("develop").unwrap(), "develop");
        for bad in [
            "",
            "Main",
            "DEVELOP",
            " main",
            "main ",
            "main; rm -rf ~",
            "../x",
            "develop\n",
            "main\0",
            "origin/main",
            "--no-pull",
        ] {
            let error = channel_from(bad).unwrap_err();
            assert_eq!(error.code, ErrorCode::InvalidPath, "{bad:?}");
        }
    }

    #[test]
    fn a_refused_channel_builds_no_command() {
        // The real script is there, so only the channel can be what is refused.
        for bad in ["", "Main", "main; rm -rf ~", "../x", "develop\n"] {
            let error = script_command(&checkout_root(), bad).unwrap_err();
            assert_eq!(error.code, ErrorCode::InvalidPath, "{bad:?}");
        }
        assert!(script_command(&checkout_root(), "main").is_ok());
    }

    #[test]
    fn a_missing_script_is_a_plain_error() {
        let tmp = TempDir::new();
        let error = script_command_with(tmp.path(), "/bin/zsh", "main").unwrap_err();
        assert_eq!(error.code, ErrorCode::NotFound);
        assert!(!error.message.contains('/'));
    }

    #[test]
    fn only_an_absolute_shell_path_is_used() {
        assert_eq!(
            shell_from(Some("/opt/homebrew/bin/fish")),
            "/opt/homebrew/bin/fish"
        );
        assert_eq!(shell_from(Some("zsh")), "/bin/zsh");
        assert_eq!(shell_from(None), "/bin/zsh");
    }

    #[test]
    fn this_checkout_has_the_script_the_button_runs() {
        assert!(checkout_root().join(SCRIPT).is_file());
    }

    #[test]
    fn the_fetch_and_log_arguments_are_fixed_and_only_name_an_allowed_branch() {
        assert_eq!(CHANNELS, ["main", "develop"]);
        for branch in CHANNELS {
            assert_eq!(fetch_args(branch), ["fetch", "--quiet", "origin", branch]);
        }
        assert_eq!(remote_ref("develop"), "origin/develop");
        assert!(LOG_FORMAT.starts_with("--format="));
    }

    #[test]
    fn a_log_line_is_split_into_commit_time_and_subject() {
        let line = "abc123def456\u{1f}abc123d\u{1f}2026-11-17T10:40:00+00:00\u{1f}feat: x\u{1f}y\n";
        let info = parse_log(line).unwrap();
        assert!(info.exists);
        assert_eq!(info.commit, "abc123def456");
        assert_eq!(info.short_commit, "abc123d");
        assert_eq!(info.committed_at, "2026-11-17T10:40:00+00:00");
        assert_eq!(info.subject, "feat: x\u{1f}y");
        assert_eq!(parse_log(""), None);
        assert_eq!(parse_log("only one field"), None);
    }

    #[test]
    fn a_missing_remote_branch_is_told_apart_from_other_fetch_failures() {
        assert!(branch_is_missing(
            "fatal: couldn't find remote ref develop\n"
        ));
        assert!(!branch_is_missing(
            "fatal: Could not resolve host: github.com"
        ));
    }

    #[test]
    fn build_info_falls_back_to_unknown() {
        let unknown = build_info_from(None, Some("  "), Some(""));
        assert_eq!(unknown.branch, "unknown");
        assert_eq!(unknown.commit, "unknown");
        assert_eq!(unknown.built_at, "unknown");
        let known = build_info_from(Some("main"), Some("abc"), Some("2026-11-17T10:40:00Z"));
        assert_eq!(known.branch, "main");
        assert_eq!(known.built_at, "2026-11-17T10:40:00Z");
    }

    fn run_git(dir: &Path, args: &[&str]) {
        let out = Command::new("git")
            .current_dir(dir)
            .args(["-c", "user.name=t", "-c", "user.email=t@example.com"])
            .args(args)
            .output()
            .unwrap();
        assert!(out.status.success(), "git {args:?}: {out:?}");
    }

    /// A bare "origin" with a `main` commit, and a clone of it.
    fn origin_and_clone() -> (TempDir, PathBuf) {
        let tmp = TempDir::new();
        let seed = tmp.path().join("seed");
        fs::create_dir(&seed).unwrap();
        run_git(&seed, &["init", "-q", "-b", "main"]);
        fs::write(seed.join("a.txt"), "a").unwrap();
        run_git(&seed, &["add", "a.txt"]);
        run_git(&seed, &["commit", "-q", "-m", "first change"]);
        let origin = tmp.path().join("origin.git");
        let origin_arg = origin.to_str().unwrap();
        run_git(tmp.path(), &["clone", "-q", "--bare", "seed", origin_arg]);
        let clone = tmp.path().join("clone");
        run_git(tmp.path(), &["clone", "-q", origin_arg, "clone"]);
        (tmp, clone)
    }

    #[test]
    fn a_folder_without_develop_reports_main_and_no_develop() {
        let (_tmp, clone) = origin_and_clone();
        let channels = channels_in(&clone);
        assert_eq!(channels.error, None);
        assert!(channels.main.exists);
        assert_eq!(channels.main.subject, "first change");
        assert_eq!(channels.main.commit.len(), 40);
        assert!(!channels.develop.exists);
    }

    #[test]
    fn a_new_develop_branch_shows_up_and_the_checkout_is_untouched() {
        let (tmp, clone) = origin_and_clone();
        let other = tmp.path().join("other");
        let origin = tmp.path().join("origin.git");
        run_git(
            tmp.path(),
            &["clone", "-q", origin.to_str().unwrap(), "other"],
        );
        run_git(&other, &["checkout", "-q", "-b", "develop"]);
        fs::write(other.join("b.txt"), "b").unwrap();
        run_git(&other, &["add", "b.txt"]);
        run_git(&other, &["commit", "-q", "-m", "on develop"]);
        run_git(&other, &["push", "-q", "origin", "develop"]);

        let head = |dir: &Path| {
            let out = Command::new("git")
                .current_dir(dir)
                .args(["rev-parse", "HEAD"])
                .output()
                .unwrap();
            String::from_utf8(out.stdout).unwrap()
        };
        let before = head(&clone);
        let channels = channels_in(&clone);
        assert!(channels.develop.exists);
        assert_eq!(channels.develop.subject, "on develop");
        assert_eq!(head(&clone), before);
        assert!(!clone.join("b.txt").exists());
    }

    #[test]
    fn a_failed_fetch_is_reported_and_the_last_known_commits_are_kept() {
        let (tmp, clone) = origin_and_clone();
        assert!(channels_in(&clone).main.exists);
        fs::remove_dir_all(tmp.path().join("origin.git")).unwrap();
        let channels = channels_in(&clone);
        assert!(channels.error.is_some());
        assert!(channels.main.exists);
        assert_eq!(channels.main.subject, "first change");
    }

    #[test]
    fn a_folder_that_is_not_a_git_checkout_reports_an_error_and_nothing_else() {
        let tmp = TempDir::new();
        let channels = channels_in(tmp.path());
        assert!(channels.error.is_some());
        assert!(!channels.main.exists);
        assert!(!channels.develop.exists);
    }
}
