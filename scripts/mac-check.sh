#!/usr/bin/env bash
# The checks that only mean something on a Mac (file names that differ only in
# capital letters), plus the usual ones. Run before a release and after changes
# to file or folder code. Usage: npm run mac-check
set -euo pipefail

if [ "$(uname)" != "Darwin" ]; then
  echo "npm run mac-check is meant for a Mac; on other systems use npm run check." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
npm run check
(cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test)
echo "Mac checks passed."
