pub mod file_ops;
pub mod host_error;
#[cfg(test)]
mod test_util;
pub mod vault;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(VaultState::default())
        .invoke_handler(tauri::generate_handler![
            app_info,
            read_text,
            write_text_atomic
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
    fn app_info_reports_package_name_and_version() {
        let info = app_info_value();
        assert_eq!(info.name, "vaultops");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }
}
