# Stopgaps

Temporary solutions that work today but must be replaced or hardened before anyone besides the maintainer uses the app. See "Internal phase" in `AGENTS.md`. Add a row when you add a `STOPGAP(<name>)` comment; remove it when the stopgap is replaced.

| Name | Files | Why it exists | Replace with | Needed before a public release |
| ---- | ----- | ------------- | ------------ | ------------------------------ |
| update-script | `src-tauri/src/update_script.rs`, `src/app/UpdateSection.tsx`, `startUpdateScript`, `updateScriptStatus`, `buildInfo` and `updateChannels` in `src/host/` | There is no signed release pipeline yet (#274 and #275 are paused), so the Settings "Update VaultOps" button runs the maintainer's `scripts/install-vaultops.sh` from the code folder the app was built from. The same section also checks GitHub (a `git fetch` of `main` and `develop` in that folder) and says, for each of the two branches, whether it is the one running and whether it is up to date; the install script bakes the branch, commit and build time into the app. | The Tauri updater with a published, signed release (#274, #275). | Remove it. It only works for an app built from a source checkout, and it starts a script in a login shell.
