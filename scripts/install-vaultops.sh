#!/usr/bin/env bash
# Build the current checkout and install VaultOps as a local Mac app.
# Usage: bash scripts/install-vaultops.sh
set -uo pipefail

fail() {
  echo "VaultOps install failed: $*" >&2
  exit 1
}

[ "$(uname)" = "Darwin" ] || fail "This installer runs only on macOS."
cd "$(dirname "$0")/.." || fail "Could not open the project folder."

mode="${1:-}"
[ "$#" -le 1 ] || fail "Usage: bash scripts/install-vaultops.sh [--no-pull]"
case "$mode" in
  ""|--no-pull) ;;
  *) fail "Usage: bash scripts/install-vaultops.sh [--no-pull]" ;;
esac

branch="$(git rev-parse --abbrev-ref HEAD)" || fail "Could not read the Git branch."
before="$(git rev-parse HEAD)" || fail "Could not read the current commit."
status="$(git status --porcelain)" || fail "Could not check for local changes."
if [ "$mode" = --no-pull ]; then
  echo "Skipping the pull; building the checkout as it is."
elif [ "$branch" = "main" ] && [ -z "$status" ]; then
  if ! git pull --ff-only; then
    echo "Could not update (perhaps offline); building the version already here."
  fi
else
  echo "This folder is on '$branch' or has unsaved changes, so it was not touched."
  echo "Building it as it is."
fi

commit="$(git rev-parse HEAD)" || fail "Could not read the build commit."
short_commit="$(git rev-parse --short HEAD)" || fail "Could not read the short commit."
if [ ! -d node_modules ] || ! git diff --quiet "$before" HEAD -- package-lock.json ||
   ! git diff --quiet HEAD -- package-lock.json; then
  echo "Installing dependencies..."
  npm ci || fail "npm ci failed."
fi

echo "Building VaultOps.app (the first release build takes several minutes)..."
npm run tauri build -- --bundles app || fail "The app build failed; the installed app was not changed."
bundle="src-tauri/target/release/bundle/macos/VaultOps.app"
[ -d "$bundle" ] || fail "The build did not produce $bundle."
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$bundle/Contents/Info.plist")" ||
  fail "Could not read the built app's version."

install_dir="/Applications"
if [ ! -w "$install_dir" ]; then
  install_dir="$HOME/Applications"
  mkdir -p "$install_dir" || fail "Could not create $install_dir."
  [ -w "$install_dir" ] || fail "Cannot write to $install_dir."
  echo "Using $install_dir because /Applications is not writable."
fi
target="$install_dir/VaultOps.app"
previous="$install_dir/VaultOps (previous).app"
stage="$(mktemp -d "$install_dir/.VaultOps-install.XXXXXX")" || fail "Could not stage the app in $install_dir."
if ! ditto "$bundle" "$stage/VaultOps.app"; then
  rm -R "$stage"
  fail "Could not copy the new app; the installed app was not changed."
fi

# Ask the app to quit, then leave it alone if it is still running. A note may
# have unsaved edits, so never force quit it.
if pgrep -x -i vaultops >/dev/null; then
  echo "Asking VaultOps to quit..."
  osascript -e 'tell application id "com.bcndlabs.vaultops" to quit' >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5; do
    pgrep -x -i vaultops >/dev/null || break
    sleep 1
  done
  if pgrep -x -i vaultops >/dev/null; then
    rm -R "$stage"
    fail "VaultOps is still running. Please quit it normally, then run this script again."
  fi
fi

# Move the old rollback copy aside until the new app is safely in place.
had_current=false
if [ -e "$target" ]; then
  had_current=true
fi
had_previous=false
if [ "$had_current" = true ] && [ -e "$previous" ]; then
  mv "$previous" "$stage/older.app" || fail "Could not move the previous app; staged files remain at $stage."
  had_previous=true
fi
if [ "$had_current" = true ]; then
  if ! mv "$target" "$previous"; then
    if [ "$had_previous" = true ]; then
      mv "$stage/older.app" "$previous" || fail "Could not restore the previous app; find it at $stage/older.app."
    fi
    rm -R "$stage"
    fail "Could not move the installed app; it was not replaced."
  fi
fi
if ! mv "$stage/VaultOps.app" "$target"; then
  restored=true
  if [ "$had_current" = true ]; then
    mv "$previous" "$target" || restored=false
  fi
  if [ "$had_previous" = true ]; then
    mv "$stage/older.app" "$previous" || restored=false
  fi
  if [ "$restored" = true ]; then
    rm -R "$stage"
    fail "Could not install the new app; the old app was restored."
  fi
  fail "Could not install or fully restore the app. Check $install_dir and $stage before retrying."
fi
rm -R "$stage" || fail "Installed the app, but could not remove temporary files at $stage."

state_dir="$HOME/Library/Application Support/VaultOps-installer"
mkdir -p "$state_dir" || fail "Installed the app, but could not create $state_dir."
state_file="$state_dir/last-installed-commit"
old_commit=""
if [ -f "$state_file" ]; then
  old_commit="$(cat "$state_file")" || fail "Installed the app, but could not read $state_file."
fi
state_tmp="$(mktemp "$state_dir/.last-installed.XXXXXX")" || fail "Installed the app, but could not stage its commit record."
if ! printf '%s\n' "$commit" > "$state_tmp" || ! mv "$state_tmp" "$state_file"; then
  rm -f "$state_tmp"
  fail "Installed the app, but could not save its commit record."
fi

echo "Installed VaultOps $version ($short_commit) at $target."
if [ -n "$status" ]; then
  echo "This build also includes local changes; the commit log below only shows committed changes."
fi
if [ "$old_commit" = "$commit" ]; then
  echo "No new commits since the last install."
elif [[ "$old_commit" =~ ^[0-9a-f]{40}$ ]] && git cat-file -e "$old_commit^{commit}" 2>/dev/null; then
  echo "Commits since the last install:"
  git log --oneline "$old_commit..$commit" || fail "Installed the app, but could not show the commit log."
else
  echo "First install, or the last installed commit is no longer in this checkout."
fi
open "$target" || fail "Installed the app, but could not open it."
