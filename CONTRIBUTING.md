# Contributing

Thanks for your interest in VaultOps. It's early, built mostly by one person, and run in the open.

## Before you start

- Look at the [milestones](https://github.com/BCnD-Labs/vaultops/milestones) and open issues to see what's planned and where things stand.
- Talk first: open an issue or email **bcndlabs@pm.me** before starting anything bigger than a small fix. The design notes behind each task are private; ask if you need them.
- Coding agents (Claude Code, Codex and others) follow [AGENTS.md](AGENTS.md). People should read it too: it has the commands and the architecture rules.

## Making a change

1. Branch from `main`; `main` is protected and only takes pull requests.
2. Keep each pull request small (roughly under 400 changed lines, lock files aside); it may close up to 3 related issues.
3. Run `npm run check` and, in `src-tauri/`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test`.
4. Fill in the pull request template: plain words for a non-developer, the issue link (`Closes #N` or `Part of #N`), and **Tested** / **Not tested**. Keep it lean.

## Rules that matter most

- **Reuse before building:** prefer an existing, maintained library or official plugin. New dependencies need the maintainer's approval.
- **Licenses:** only permissive code (MIT, Apache-2.0, BSD, ISC). Never copy code from GPL, AGPL or source-available projects. The Dependency review check enforces the dependency license list.
- **Never lose user data:** atomic writes, deletes go to trash, and everything stays inside the open vault.

## Checks on every pull request

CI (TypeScript and Rust), PR rules (description and size), Dependency review (licenses and security) and, for app changes, an automatic screenshot. All must pass before merge.

## License

By contributing you agree that your contribution is licensed under the [AGPL-3.0](LICENSE), the project's license.
