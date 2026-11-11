//! STOPGAP(update-script): the Settings "Update VaultOps" button runs the
//! maintainer's `scripts/install-vaultops.sh` from the code folder this app was
//! built from, until the real in-app updater (#274, #275) can ship. See
//! docs/stopgaps.md.
//!
//! The script builds first and only then asks the app to quit the normal way
//! (which saves the open note), so it never force quits. It is started in its own
//! process group with its output going to a log file in the app's log folder, so
//! it keeps running while the app closes and the new one opens.

use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;

use crate::host_error::{ErrorCode, HostError};

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

/// The command that runs the script in `root`. The command text is fixed: nothing
/// from the window ever reaches it.
pub fn script_command_with(root: &Path, shell: &str) -> Result<Command, HostError> {
    if !root.join(SCRIPT).is_file() {
        return Err(HostError::new(
            ErrorCode::NotFound,
            "the update script was not found in the code folder this app was built from",
        ));
    }
    let mut command = Command::new(shell);
    command
        .current_dir(root)
        .args(["-l", "-i", "-c", "exec bash scripts/install-vaultops.sh"]);
    Ok(command)
}

pub fn script_command(root: &Path) -> Result<Command, HostError> {
    let shell = std::env::var("SHELL").ok();
    script_command_with(root, &shell_from(shell.as_deref()))
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
        let command = script_command_with(tmp.path(), "/bin/zsh").unwrap();
        assert_eq!(command.get_program(), "/bin/zsh");
        let args: Vec<_> = command.get_args().collect();
        assert_eq!(
            args,
            ["-l", "-i", "-c", "exec bash scripts/install-vaultops.sh"]
        );
        assert_eq!(command.get_current_dir(), Some(tmp.path()));
    }

    #[test]
    fn a_missing_script_is_a_plain_error() {
        let tmp = TempDir::new();
        let error = script_command_with(tmp.path(), "/bin/zsh").unwrap_err();
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
}
