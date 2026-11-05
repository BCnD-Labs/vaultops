import { type Host, HostError } from "./host";

export const READ_ONLY_VAULT_MESSAGE =
	"This vault is read-only, so nothing was changed.";

const refuse = (): Promise<never> =>
	Promise.reject(new HostError("io", READ_ONLY_VAULT_MESSAGE));

/**
 * The same host with every write to the vault refused. The app uses it for a
 * vault it must not change (made by a newer version), so even a bug in the
 * screens or the core code cannot reach the files. Reads, choosing a vault and
 * closing pass through, and so do the app's own files, log and reports, which
 * are never inside a vault.
 *
 * Written out method by method on purpose: a new `Host` method fails to
 * compile here until someone decides whether it writes to the vault.
 */
export function readOnlyHost(host: Host): Host {
	return {
		appInfo: () => host.appInfo(),
		chooseVault: () => host.chooseVault(),
		currentVault: () => host.currentVault(),
		readText: (path) => host.readText(path),
		list: (folder) => host.list(folder),
		kindOf: (path) => host.kindOf(path),
		onCloseRequested: (handler) => host.onCloseRequested(handler),
		readAppFile: (name) => host.readAppFile(name),
		readLogTail: (maxLines) => host.readLogTail(maxLines),
		reportsFolder: () => host.reportsFolder(),
		chooseReportsFolder: () => host.chooseReportsFolder(),
		// The app's own files, never part of the vault.
		appendLog: (lines) => host.appendLog(lines),
		writeAppFile: (name, text) => host.writeAppFile(name, text),
		writeReport: (name, text) => host.writeReport(name, text),
		// Updates the installed app, never the vault.
		startUpdateScript: () => host.startUpdateScript(),
		updateScriptStatus: () => host.updateScriptStatus(),
		// Everything that changes the vault's folder.
		writeTextAtomic: refuse,
		move: refuse,
		makeFolder: refuse,
		removeTrashed: refuse,
	};
}
