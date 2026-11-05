# Install VaultOps on a Mac

From the VaultOps code folder, run:

```bash
bash scripts/install-vaultops.sh
```

The script updates a clean `main` checkout when it can, builds the app, and installs it in `/Applications` or `~/Applications` if needed. The first release build can take several minutes. Run the same command whenever you want to update. If you are offline, it builds the checkout already on your Mac. If the checkout has local changes or is on another branch, it leaves the checkout alone and builds it as is.

Use `bash scripts/install-vaultops.sh --no-pull` to build what is already checked out without checking for updates.

For a double-click launcher, create a `.command` file with these lines, replacing the folder path with your checkout's path, then run `chmod +x` on that file:

```bash
#!/usr/bin/env bash
cd "/path/to/vaultops" || exit 1
bash scripts/install-vaultops.sh
```

You can also update from inside the app: **Settings, Updates, Update VaultOps**. It asks first, then runs this same script from the code folder the app was built from, shows the script's latest line while it builds (you can keep working), and when it is ready the script asks VaultOps to quit (the open note is saved), installs the new app and opens it. If anything fails, the status line shows the script's last line and the installed app is left as it was. This button is a stopgap (see `docs/stopgaps.md`) until the real updater ships. It needs the app to have been built by this script from a checkout that is still in the same place.

To roll back, quit VaultOps normally. In the Applications folder printed by the installer, rename `VaultOps.app` to `VaultOps (new).app`, then rename `VaultOps (previous).app` to `VaultOps.app` and open it. Each successful update keeps one previous version. Running the installer again replaces that rollback copy.

The installed app has separate browser-style storage from `npm run tauri dev`. On its first launch, it may ask you to open your vault folder again. The installer never changes the vault or its notes.

## Troubleshooting

The installer prints the installed app's version and short code commit, plus commits since the last install. It stores the last installed commit in `~/Library/Application Support/VaultOps-installer/last-installed-commit`. The current app version is also visible in `VaultOps.app/Contents/Info.plist` as `CFBundleShortVersionString`.

If VaultOps does not quit after the script asks it to, save your work, quit the app normally, and run the command again. The script will not force quit it.
