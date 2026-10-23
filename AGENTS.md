# AGENTS.md

Working rules for coding agents (Claude Code, Codex and others) in this repo. Read this before changing anything.

## What this is

VaultOps (working name) is a macOS desktop app built with Tauri 2: a visual, offline way to manage local git repos with a GitHub-style workflow, alongside notes that have their own block-level version history. Everything is local: no accounts, no sync, no network features.

## Where things live

- `src/`: TypeScript and React frontend.
  - `src/core/`: pure logic with no editor, window or disk access. Tests sit next to the code as `*.test.ts`.
  - `src/host/`: the only door to native code (files, git, dialogs).
- `src-tauri/`: the Rust side and its native commands.
- Planning docs (spec, decision records, task list) are private and not in this repo. Each task comes with a brief from the maintainer. If a task needs a decision the brief doesn't cover, stop and ask instead of choosing.
- `private/` and `spikes/` may exist locally; both are git-ignored. Spike code is experimental: read it for reference, never copy it in.

## Commands

```bash
npm ci                 # install exactly what package-lock.json lists
npm run tauri dev      # run the app (first Rust build takes a few minutes)
npm run check          # typecheck + lint + tests (TypeScript)
npm test               # tests only
npm run format         # auto-fix formatting and lint where possible

cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

## Rules

**Architecture**
- Every native call goes through the `Host` interface in `src/host/`. Do not import `@tauri-apps/api` anywhere else.
- Git runs from Rust as `Command::new("git").args([...])`, never through a shell, with `--` before any user-supplied path.
- File access stays inside the open vault folder: no `..`, no absolute paths from the frontend, no symlink escapes.
- Never silently lose or overwrite user data. Writes are atomic (temp file, then rename); deletes move to trash.

**Reuse before building**
- Prefer an existing, maintained library, Tiptap/React Flow extension or official Tauri plugin over writing it from scratch; propose it to the maintainer (new dependencies need approval).
- Only use code under permissive licenses (MIT, Apache-2.0, BSD, ISC). Never copy code from GPL, AGPL or source-available non-compete (for example FSL) projects; reading them to learn how a problem was solved is fine. MPL-2.0 code may only be used as an unmodified dependency, not copied in.

**Ask the maintainer first**
- Changes to the note file format, storage layout or history design.
- New dependencies (npm or Cargo), and changes to CI.
- Anything that talks to a network or a git remote.

**Workflow**
- One small pull request into `main` per piece of work. `main` is protected: never push to it directly.
- Pull request size: keep each one reviewable in one sitting (roughly under 400 changed lines, lock files aside). Split a task into one pull request per sub-issue when it has a security-sensitive or large part; keep small tasks, or parts that make no sense alone, in one pull request. Say which in the first pull request of the task.
- Link the issue: `Closes #N` for the sub-issue (or task) the pull request finishes.
- Pull requests are squash-merged. Commit prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`.
- Before opening a pull request: `npm run check` and the Rust checks pass locally, and CI must be green before merge.
- Commit messages are technical: what changed in the code and why, in developer terms.
- Pull request descriptions are written for a non-developer reader: what changed for the app or the project, in plain words, then what was tested and what was not. Add screenshots when the change is visible (the screenshot check posts them automatically for app changes).
- No `Co-Authored-By` trailers, session links or "Generated with" footers in commits or pull requests.
