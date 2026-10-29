#!/usr/bin/env bash
# Update to the newest main and open the app in development mode. Used by the
# "Open VaultOps" launcher on the maintainer's Desktop, so changes here reach
# the launcher with the next pull. Usage: bash scripts/open-vaultops.sh
set -uo pipefail

cd "$(dirname "$0")/.."

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ] || [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "This folder is on '$branch' or has unsaved changes, so it was not touched."
  echo "Starting the app as it is. (Codex or another session may be using this folder.)"
else
  before="$(git rev-parse HEAD)"
  if git pull --ff-only; then
    :
  else
    echo "Could not update (offline?). Starting the version already here."
  fi
  # Reinstall only when the dependency list changed.
  if [ "$before" != "$(git rev-parse HEAD)" ] && ! git diff --quiet "$before" HEAD -- package-lock.json; then
    echo "Dependencies changed; installing..."
    npm ci || { echo "npm ci failed."; exit 1; }
  elif [ ! -d node_modules ]; then
    npm ci || { echo "npm ci failed."; exit 1; }
  fi
fi

npm run tauri dev
