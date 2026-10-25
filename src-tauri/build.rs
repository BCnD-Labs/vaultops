// Declares the app's own commands so each one needs an explicit permission in
// capabilities/default.json (Tauri 2 app manifest). A command not listed
// there can't be called from the window.
const COMMANDS: &[&str] = &[
    "app_info",
    "read_text",
    "write_text_atomic",
    "list",
    "make_folder",
    "kind_of",
    "move_entry",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run the Tauri build script");
}
