#!/usr/bin/env bash
# After a builder run: commit, push and open the pull request, or put the issue
# on hold with a comment when the agent stopped, changed nothing, or touched
# files it must not. Needs AGENT, ISSUE, BRANCH, GH_TOKEN (a token whose pull
# requests trigger CI) and GITHUB_REPOSITORY.
set -euo pipefail

hold() {
  gh issue comment "$ISSUE" --body "**${AGENT^} stopped and needs Blake:** $1"
  gh issue edit "$ISSUE" --add-label hold
  echo "Put #$ISSUE on hold: $1" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
  exit 0
}

if [ -s .agent/blocked.md ]; then
  hold "$(cat .agent/blocked.md)"
fi
if [ -z "$(git status --porcelain)" ]; then
  hold "the run finished without changing any files."
fi
if [ -n "$(git status --porcelain -- .github package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock)" ]; then
  git status --porcelain -- .github package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock
  hold "the change touches CI or dependencies, which need Blake's approval first. Nothing was pushed."
fi
if [ ! -s .agent/commit-message.txt ] || [ ! -s .agent/pr-body.md ]; then
  hold "the run did not write its commit message and pull request description. Nothing was pushed."
fi

git switch -q -c "$BRANCH"
git add -A
git -c user.name="${AGENT^} (VaultOps agents)" -c user.email="vaultops-agents@users.noreply.github.com" \
  commit -q -F .agent/commit-message.txt
git push -q --force "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "HEAD:refs/heads/$BRANCH"
url=$(gh pr create --base main --head "$BRANCH" --title "$(head -1 .agent/commit-message.txt)" \
  --body-file .agent/pr-body.md --label "agent:$AGENT")
echo "Opened $url" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
