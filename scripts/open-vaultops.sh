#!/usr/bin/env bash
# Update to the newest main and open the app in development mode. Used by the
# "Open VaultOps" launcher on the maintainer's Desktop, so changes here reach
# the launcher with the next pull. Usage: bash scripts/open-vaultops.sh
#
# The file watcher is off (--no-watch): the build writes files into src-tauri
# itself, and the watcher restarted the app over and over because of that. The
# page still reloads by itself when frontend code changes; a Rust change needs
# the app to be started again.
set -euo pipefail

cd "$(dirname "$0")/.."
git checkout main
git pull --ff-only
npm ci
npm run tauri dev -- --no-watch
