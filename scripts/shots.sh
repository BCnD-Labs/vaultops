#!/usr/bin/env bash
# Build the app, open it, and save a screenshot of the screen to shots/.
# macOS only. Usage: npm run shots [seconds to wait before the screenshot, default 15]
set -euo pipefail

if [ "$(uname)" != "Darwin" ]; then
  echo "npm run shots only works on a Mac (it uses the system screenshot tool)." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
wait_s="${1:-15}"
mkdir -p shots
stamp="$(date +%Y%m%d-%H%M%S)"

echo "Building (debug build, first time takes a few minutes)..."
npx tauri build --debug --no-bundle

echo "Opening the app..."
./src-tauri/target/debug/vaultops > "shots/app-$stamp.log" 2>&1 &
app=$!
trap 'kill "$app" 2>/dev/null || true' EXIT

echo "Waiting ${wait_s}s so you can get the window into the state you want..."
sleep "$wait_s"
screencapture -x "shots/window-$stamp.png"
echo "Saved shots/window-$stamp.png"
