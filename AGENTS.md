# AGENTS.md

Working rules for coding agents (Claude Code, Codex and others) in this repo. Read this before changing anything.

## What this is

VaultOps (working name) is a macOS desktop app built with Tauri 2: a visual, offline way to manage local git repos with a GitHub-style workflow, alongside notes that have their own block-level version history. Everything is local: no accounts, no sync, no network features.

## Where things live

- `src/`: TypeScript and React frontend.
  - `src/core/`: pure logic with no editor, window or disk access. Tests sit next to the code as `*.test.ts`.
  - `src/host/`: the only door to native code (files, git, dialogs).
- `src-tauri/`: the Rust side and its native commands.
- Planning docs (spec, decision records, task list) are private and not in this repo. Each task comes with a brief in its issue. If the brief doesn't cover a decision, make the most reasonable choice, keep going, and list it under **Choices I made** in the pull request; if it turns out wrong, it becomes a new issue.
- `private/` and `spikes/` may exist locally; both are git-ignored. Spike code is experimental: read it for reference, never copy it in.

## Commands

```bash
npm ci                 # install exactly what package-lock.json lists
npm run tauri dev      # run the app (first Rust build takes a few minutes)
npm run check          # typecheck + lint + tests (TypeScript)
npm test               # tests only
npm run format         # auto-fix formatting and lint where possible
npm run shots          # Mac only: build, open the app, save a screenshot to shots/
npm run open           # Mac only: update to main and open the app (file watcher off)
npm run mac-check      # Mac only: npm run check plus the Rust checks (run before releases)

cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

CI runs the Rust checks on Linux. Some tests only check anything on a Mac (names that differ only in capital letters), so the maintainer runs `npm run mac-check` on the Mac before each release and after changes to file or folder code.

## Team and handoff

Claude and Codex build; Blake (the maintainer) decides product questions and merges. Gemini does not build: it writes the recap (Actions -> Recap). Status lives in labels and pull requests.

- **Labels.** `ready` = has a brief and can be picked up by any builder. A "Depends on" section in an issue lists issues that must be closed first. `needs decision` and `paused` = leave it alone until Blake clears the label (a comment says why). `deferred` = not now.
- **Starting work.** Take the oldest open `ready` issue whose "Depends on" issues are all closed and that has no open pull request. The Agents button (Actions -> Agents: pick claude or codex, `next`, and 1 to 3 issues) does this for you, one pull request per issue; it also works from the GitHub mobile app. Codex runs on Blake's Mac, so the Mac must be on and awake.
- **Builders don't stop to ask.** Small gaps in a brief are decided by the builder and listed under **Choices I made** in the pull request. If the job needs something on the "Ask the maintainer first" list below, build everything else, then describe it under **Decision needed** (options A, B, C) and add the `needs decision` label.
- **If a run can't finish** (nothing changed, the brief can't be met, or it touches CI or dependencies): the issue gets a comment and the `needs decision` label, nothing is pushed, and the next issue still runs.
- **Review.** There is no review step. CI must be green and Blake merges. A pull request that fails CI is left as it is for Blake or the next session to fix.
- **Maintainer's word wins.** If Blake names an issue, take it whatever its labels.

## Rules

**Architecture**
- Every native call goes through the `Host` interface in `src/host/`. Do not import `@tauri-apps/api` anywhere else.
- Git runs from Rust as `Command::new("git").args([...])`, never through a shell, with `--` before any user-supplied path.
- File access stays inside the open vault folder: no `..`, no absolute paths from the frontend, no symlink escapes.
- Never silently lose or overwrite user data. Writes are atomic (temp file, then rename); deletes move to trash.

**Reuse before building**
- Prefer an existing, maintained library, Tiptap/React Flow extension or official Tauri plugin over writing it from scratch; propose it to the maintainer (new dependencies need approval). Say which one you used in the pull request when it matters.
- Only use code under permissive licenses (MIT, Apache-2.0, BSD, ISC). Never copy code from GPL, AGPL or source-available non-compete (for example FSL) projects; reading them to learn how a problem was solved is fine. MPL-2.0 code may only be used as an unmodified dependency, not copied in. Dependencies may also use Unicode-3.0, Zlib or Apache-2.0 with the LLVM exception (permissive licenses Tauri's crates already use). The Dependency review check enforces this list on every pull request.

**Ask the maintainer first**
- Changes to the note file format, storage layout or history design.
- New dependencies (npm or Cargo), and changes to CI.
- Anything that talks to a network or a git remote.

**Workflow**
- One small pull request into `main` per piece of work. `main` is protected: never push to it directly.
- Pull request size: keep each one reviewable in one sitting (roughly under 400 changed lines, lock files aside). A pull request may group up to 3 related issues that would otherwise be separate pull requests, as long as it stays reviewable; keep security-sensitive or large parts on their own.
- Link the issue: `Closes #N` for each issue the pull request finishes (up to 3), or `Part of #N` when it only does part of one. Fill in `.github/pull_request_template.md`; the PR rules check enforces the issue link, Tested and Not tested.
- Pull requests are squash-merged. Commit prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`, `ci:`.
- Before opening a pull request: `npm run check` and the Rust checks pass locally, and CI must be green before merge.
- Commit messages are technical: what changed in the code and why, in developer terms.
- Pull request descriptions are lean and written for a non-developer reader: what changed for the app or the project, in plain words; **Choices I made** or **Decision needed** only if there are any; then **Tested** and **Not tested**. Don't restate the brief. Add screenshots when the change is visible (the screenshot check posts them automatically for app changes).
- No `Co-Authored-By` trailers, session links or "Generated with" footers in commits or pull requests.
