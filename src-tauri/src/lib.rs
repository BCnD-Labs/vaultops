pub mod app_files;
pub mod file_ops;
pub mod folder_ops;
pub mod host_error;
pub mod log_file;
pub mod reports;
#[cfg(test)]
mod test_util;
pub mod vault;

use std::path::{Path, PathBuf};

use serde::Serialize;

use host_error::{ErrorCode, HostError};
use vault::{Vault, VaultState};

/// Basic facts about the running app, returned to the `host` interface.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
}

fn app_info_value() -> AppInfo {
    AppInfo {
        name: env!("CARGO_PKG_NAME"),
        version: env!("CARGO_PKG_VERSION"),
    }
}

/// Basic app facts.
#[tauri::command]
fn app_info() -> AppInfo {
    app_info_value()
}

/// Run `f` with the open vault, or fail if none is open.
fn with_vault<T>(
    state: &VaultState,
    f: impl FnOnce(&Vault) -> Result<T, HostError>,
) -> Result<T, HostError> {
    let guard = state
        .0
        .lock()
        .map_err(|_| HostError::new(ErrorCode::Io, "vault state is unavailable"))?;
    let vault = guard
        .as_ref()
        .ok_or(HostError::new(ErrorCode::Io, "no vault is open"))?;
    f(vault)
}

/// Runs off the main thread so a large file never freezes the window.
#[tauri::command(async)]
fn read_text(state: tauri::State<'_, VaultState>, path: String) -> Result<String, HostError> {
    with_vault(&state, |v| file_ops::read_text(v, &path))
}

/// Runs off the main thread so a large file never freezes the window.
#[tauri::command(async)]
fn write_text_atomic(
    state: tauri::State<'_, VaultState>,
    path: String,
    text: String,
) -> Result<(), HostError> {
    with_vault(&state, |v| file_ops::write_text_atomic(v, &path, &text))
}

#[tauri::command(async)]
fn list(
    state: tauri::State<'_, VaultState>,
    folder: String,
) -> Result<Vec<folder_ops::DirEntry>, HostError> {
    with_vault(&state, |v| folder_ops::list(v, &folder))
}

#[tauri::command(async)]
fn make_folder(state: tauri::State<'_, VaultState>, path: String) -> Result<(), HostError> {
    with_vault(&state, |v| folder_ops::make_folder(v, &path))
}

#[tauri::command(async)]
fn kind_of(
    state: tauri::State<'_, VaultState>,
    path: String,
) -> Result<Option<folder_ops::EntryKind>, HostError> {
    with_vault(&state, |v| folder_ops::kind_of(v, &path))
}

/// Open `path` as the vault, replacing the open one only if it succeeds, and
/// remove leftover temporary files from interrupted writes.
/// Returns the folder's name for display.
fn open_vault_at(state: &VaultState, path: &Path) -> Result<String, HostError> {
    let vault = Vault::open(path)?;
    file_ops::remove_leftover_temps(&vault)?;
    let name = vault
        .root()
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut guard = state
        .0
        .lock()
        .map_err(|_| HostError::new(ErrorCode::Io, "vault state is unavailable"))?;
    *guard = Some(vault);
    Ok(name)
}

/// The file in the app's own settings folder that remembers the last vault.
const LAST_VAULT_FILE: &str = "last-vault.txt";

fn last_vault_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(LAST_VAULT_FILE))
}

/// Remember the open vault's location for the next launch. Best effort: a
/// failure only means the vault isn't reopened automatically.
fn remember_vault(file: &Path, root: &Path) {
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(file, root.to_string_lossy().as_bytes());
}

/// The remembered vault location, if any.
fn remembered_vault(file: &Path) -> Option<PathBuf> {
    let text = std::fs::read_to_string(file).ok()?;
    let text = text.trim();
    (!text.is_empty()).then(|| PathBuf::from(text))
}

/// The open vault's folder name, or `None` when no vault is open.
#[tauri::command(async)]
fn current_vault(state: tauri::State<'_, VaultState>) -> Result<Option<String>, HostError> {
    let guard = state
        .0
        .lock()
        .map_err(|_| HostError::new(ErrorCode::Io, "vault state is unavailable"))?;
    Ok(guard.as_ref().map(|v| {
        v.root()
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    }))
}

/// Let the user choose the vault folder with the system picker and open it.
/// The chosen path stays on the Rust side: the window only learns the folder's
/// name, or `None` when the picker was cancelled (nothing changes then).
#[tauri::command(async)]
fn choose_vault(
    app: tauri::AppHandle,
    state: tauri::State<'_, VaultState>,
) -> Result<Option<String>, HostError> {
    use tauri_plugin_dialog::DialogExt;
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Choose a vault folder")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|_| HostError::invalid("that folder can't be used as a vault"))?;
    let name = open_vault_at(&state, &path)?;
    if let Some(file) = last_vault_file(&app) {
        remember_vault(&file, &path);
    }
    Ok(Some(name))
}

/// Append lines to the app's own log file in the app's log folder. The window
/// sends only text: where it goes is decided here, never by the caller, and it
/// is never inside a vault. Logging is best effort, so a failure is a plain
/// `io` error the window can ignore.
#[tauri::command(async)]
fn append_log(app: tauri::AppHandle, lines: String) -> Result<(), HostError> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|_| HostError::new(ErrorCode::Io, "log folder is unavailable"))?;
    log_file::append(&dir, &lines).map_err(|e| HostError::from_io(&e))
}

/// Read one of the app's own small files (see `app_files::ALLOWED`) from the
/// app's settings folder. `None` when it doesn't exist yet.
#[tauri::command(async)]
fn read_app_file(app: tauri::AppHandle, name: String) -> Result<Option<String>, HostError> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|_| HostError::new(ErrorCode::Io, "settings folder is unavailable"))?;
    app_files::read(&dir, &name).map_err(|e| HostError::from_io(&e))
}

/// Replace one of the app's own small files atomically.
#[tauri::command(async)]
fn write_app_file(app: tauri::AppHandle, name: String, text: String) -> Result<(), HostError> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|_| HostError::new(ErrorCode::Io, "settings folder is unavailable"))?;
    app_files::write(&dir, &name, &text).map_err(|e| HostError::from_io(&e))
}

/// The last lines of the app's log file, for the crash report.
#[tauri::command(async)]
fn read_log_tail(app: tauri::AppHandle, max_lines: usize) -> Result<String, HostError> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|_| HostError::new(ErrorCode::Io, "log folder is unavailable"))?;
    app_files::log_tail(&dir, max_lines).map_err(|e| HostError::from_io(&e))
}

/// The file in the settings folder that remembers the reports folder.
const REPORTS_FOLDER_FILE: &str = "reports-folder.txt";

fn reports_folder_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(REPORTS_FOLDER_FILE))
}

fn folder_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// The chosen reports folder, if it is set and still exists.
fn reports_folder_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let path = remembered_vault(&reports_folder_file(app)?)?;
    path.is_dir().then_some(path)
}

/// Let the maintainer pick the reports folder with the system picker. The path
/// stays on the Rust side; the window learns only the folder's name, or `None`
/// when the picker was cancelled (nothing changes then).
#[tauri::command(async)]
fn choose_reports_folder(
    app: tauri::AppHandle,
    state: tauri::State<'_, VaultState>,
) -> Result<Option<String>, HostError> {
    use tauri_plugin_dialog::DialogExt;
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Choose a folder for VaultOps reports")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|_| HostError::invalid("that folder can't be used"))?;
    // Reports must not land in the vault (they would be mixed with the notes).
    if let Ok(guard) = state.0.lock()
        && let Some(vault) = guard.as_ref()
        && reports::is_inside(&path, vault.root())
    {
        return Err(HostError::invalid("choose a folder outside the vault"));
    }
    let file = reports_folder_file(&app)
        .ok_or_else(|| HostError::new(ErrorCode::Io, "settings folder is unavailable"))?;
    remember_vault(&file, &path);
    Ok(Some(folder_name(&path)))
}

/// The reports folder's name, or `None` when none is chosen or it is gone.
#[tauri::command(async)]
fn reports_folder(app: tauri::AppHandle) -> Result<Option<String>, HostError> {
    Ok(reports_folder_path(&app).map(|p| folder_name(&p)))
}

/// Write one report file (see `reports::valid_name`) into the reports folder.
#[tauri::command(async)]
fn write_report(app: tauri::AppHandle, name: String, text: String) -> Result<(), HostError> {
    let Some(dir) = reports_folder_path(&app) else {
        return Err(HostError::invalid("no reports folder is chosen"));
    };
    reports::write(&dir, &name, &text).map_err(|e| HostError::from_io(&e))
}

/// Named `move_entry` because `move` is a Rust keyword.
#[tauri::command(async)]
fn move_entry(
    state: tauri::State<'_, VaultState>,
    from: String,
    to: String,
) -> Result<(), HostError> {
    with_vault(&state, |v| folder_ops::move_entry(v, &from, &to))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(VaultState::default())
        .setup(|app| {
            // Reopen the last vault. If it moved or is gone, start with none.
            use tauri::Manager;
            if let Some(path) = last_vault_file(app.handle()).and_then(|f| remembered_vault(&f)) {
                let _ = open_vault_at(&app.state::<VaultState>(), &path);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            choose_vault,
            current_vault,
            read_text,
            write_text_atomic,
            list,
            make_folder,
            kind_of,
            move_entry,
            append_log,
            read_app_file,
            write_app_file,
            read_log_tail,
            choose_reports_folder,
            reports_folder,
            write_report
        ])
        .build(tauri::generate_context!())
        .expect("error while building the VaultOps app")
        .run(|app, event| {
            // Cmd+Q (and Quit in the app menu) ends the app without telling the
            // window it is closing, so the window could not save first. Hold the
            // exit and close the window the normal way instead: the window's close
            // handler saves (and may keep the window open if saving fails). Once
            // the window is gone the exit is requested again and goes through.
            if let tauri::RunEvent::ExitRequested { api, code: None, .. } = event {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    api.prevent_exit();
                    let _ = window.close();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_commands_fail_cleanly_without_an_open_vault() {
        let state = VaultState::default();
        let error = with_vault(&state, |_| Ok(())).unwrap_err();
        assert_eq!(error.code, ErrorCode::Io);
        assert_eq!(error.message, "no vault is open");
    }

    #[test]
    fn opening_a_vault_replaces_the_open_one_only_on_success() {
        let first = test_util::TempDir::new();
        std::fs::create_dir(first.path().join("Notes")).unwrap();
        let state = VaultState::default();
        let name = open_vault_at(&state, &first.path().join("Notes")).unwrap();
        assert_eq!(name, "Notes");
        assert!(with_vault(&state, |v| Ok(v.root().ends_with("Notes"))).unwrap());

        // A folder that doesn't exist, or a file, leaves the open vault as it was.
        assert!(open_vault_at(&state, &first.path().join("missing")).is_err());
        std::fs::write(first.path().join("file.txt"), "x").unwrap();
        assert!(open_vault_at(&state, &first.path().join("file.txt")).is_err());
        assert!(with_vault(&state, |v| Ok(v.root().ends_with("Notes"))).unwrap());
    }

    #[test]
    fn opening_a_vault_removes_leftover_temp_files() {
        let tmp = test_util::TempDir::new();
        let root = tmp.path().join("Notes");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join(".vaultops-tmp-1-2-3"), "x").unwrap();
        std::fs::write(root.join("a.vnote"), "x").unwrap();
        open_vault_at(&VaultState::default(), &root).unwrap();
        assert!(!root.join(".vaultops-tmp-1-2-3").exists());
        assert!(root.join("a.vnote").exists());
    }

    #[test]
    fn remembers_the_last_vault_for_the_next_launch() {
        let tmp = test_util::TempDir::new();
        let file = tmp.path().join("config/last-vault.txt");
        assert_eq!(remembered_vault(&file), None);
        let root = tmp.path().join("My Notes é");
        remember_vault(&file, &root);
        assert_eq!(remembered_vault(&file), Some(root));
        std::fs::write(&file, "  \n").unwrap();
        assert_eq!(remembered_vault(&file), None);
    }

    #[test]
    fn app_info_reports_package_name_and_version() {
        let info = app_info_value();
        assert_eq!(info.name, "vaultops");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }
}
