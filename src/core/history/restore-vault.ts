/**
 * Restoring the whole vault to a save point (uses the host). Every file that
 * existed then gets its old content back; files made later are kept, or, when
 * asked, notes among them move to the trash (never deleted). Unsaved work is
 * put into a save point first, and the restore ends with one
 * "Restored the vault to …" save point, so it can itself be undone.
 */
import type { Host, VcsLogEntry } from "../../host/host";
import { trashNote } from "../notes/trash";
import { isInsideVaultOps } from "../vault/vault";

export interface VaultRestoreReport {
	restored: number;
	/** Newer files moved to the trash. */
	trashed: string[];
	/** Newer files left where they are. */
	kept: string[];
}

type RestoreHost = Pick<Host, "vcs" | "kindOf" | "makeFolder" | "move">;

export async function restoreVaultTo(
	host: RestoreHost,
	entry: Pick<VcsLogEntry, "id" | "subject">,
	options: { trashNewer: boolean; label: string },
	now: Date = new Date(),
): Promise<VaultRestoreReport> {
	if ((await host.vcs.status()).changes.length > 0)
		await host.vcs.savePoint("Before restoring the vault");
	const result = await host.vcs.restoreVault(entry.id);
	const trashed: string[] = [];
	const kept: string[] = [];
	for (const path of result.newer) {
		if (options.trashNewer && !isInsideVaultOps(path)) {
			await trashNote(host, path, now);
			trashed.push(path);
		} else kept.push(path);
	}
	await host.vcs.savePoint(
		`Restored the vault to ${options.label}: ${entry.subject}`,
	);
	return { restored: result.restored, trashed, kept };
}
