pub mod file_ops;
pub mod folder_ops;
pub mod host_error;
#[cfg(test)]
mod test_util;
pub mod vault;

use std::path::Path;

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

/// Open `path` as the vault, replacing the open one only if it succeeds.
/// Returns the folder's name for display.
fn open_vault_at(state: &VaultState, path: &Path) -> Result<String, HostError> {
    let vault = Vault::open(path)?;
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
    open_vault_at(&state, &path).map(Some)
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
        .invoke_handler(tauri::generate_handler![
            app_info,
            choose_vault,
            read_text,
            write_text_atomic,
            list,
            make_folder,
            kind_of,
            move_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running the VaultOps app");
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
    fn app_info_reports_package_name_and_version() {
        let info = app_info_value();
        assert_eq!(info.name, "vaultops");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }
}
