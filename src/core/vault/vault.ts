import { type Host, HostError } from "../../host/host";
import { checkVaultPath, nameKey } from "../vault-path/vault-path";

export const VAULT_FORMAT_VERSION = 1;

const ROOT = ".vaultops";
const CONFIG = `${ROOT}/config.json`;
const FOLDERS = ["pending", "history", "archive", "trash", "index"];

export interface VaultResult {
	status: "opened" | "created" | "read-only" | "damaged" | "not-a-vault";
	warnings: string[];
	problems: string[];
}

function damaged(problem: string): VaultResult {
	return { status: "damaged", warnings: [], problems: [problem] };
}

const isIgnorable = (entry: { kind: string; name: string }) =>
	entry.kind === "file" &&
	(entry.name === ".DS_Store" ||
		entry.name === ".localized" ||
		entry.name.startsWith("._"));

/** Create whatever of the vault's metadata is missing, config last. */
async function writeVaultFiles(host: Host): Promise<void> {
	if ((await host.kindOf(ROOT)) === null) await host.makeFolder(ROOT);
	for (const folder of FOLDERS) {
		if ((await host.kindOf(`${ROOT}/${folder}`)) === null) {
			await host.makeFolder(`${ROOT}/${folder}`);
		}
	}
	await host.writeTextAtomic(
		CONFIG,
		`{"formatVersion": ${VAULT_FORMAT_VERSION}}\n`,
	);
}

/**
 * True only for the leftovers of a creation that was interrupted before the
 * config was written: the root holds nothing but `.vaultops` (and Finder
 * files), and `.vaultops` holds nothing but empty reserved folders. Anything
 * else, even one extra file, is treated as a damaged vault and left alone.
 */
async function isUnfinishedCreation(
	host: Host,
	rootEntries: { kind: string; name: string }[],
): Promise<boolean> {
	const others = rootEntries.filter(
		(entry) => nameKey(entry.name) !== nameKey(ROOT) && !isIgnorable(entry),
	);
	if (others.length > 0) return false;
	const reserved = new Set(FOLDERS.map(nameKey));
	for (const entry of await host.list(ROOT)) {
		if (entry.kind !== "folder" || !reserved.has(nameKey(entry.name))) {
			return false;
		}
		if ((await host.list(`${ROOT}/${entry.name}`)).length > 0) return false;
	}
	return true;
}

/** Detect, create or open the folder already selected on the host. */
export async function openVault(host: Host): Promise<VaultResult> {
	const entries = await host.list("");
	// Finder metadata and AppleDouble sidecars do not make a folder a used vault.
	// Only ignore files: a folder with one of these names may hold user data.
	if (entries.every(isIgnorable)) {
		await writeVaultFiles(host);
		return { status: "created", warnings: [], problems: [] };
	}

	const root = entries.find((entry) => nameKey(entry.name) === nameKey(ROOT));
	if (!root) return { status: "not-a-vault", warnings: [], problems: [] };
	if (root.kind !== "folder") return damaged(`${ROOT} is not a folder.`);

	let text: string;
	try {
		text = await host.readText(CONFIG);
	} catch (error) {
		if (
			error instanceof HostError &&
			error.code === "not-found" &&
			(await isUnfinishedCreation(host, entries))
		) {
			await writeVaultFiles(host);
			return {
				status: "created",
				warnings: [
					"Finished setting up a vault whose creation was interrupted.",
				],
				problems: [],
			};
		}
		if (
			error instanceof HostError &&
			["not-found", "is-a-folder", "not-a-folder", "io"].includes(error.code)
		) {
			return damaged(`Cannot read ${CONFIG}: ${error.message}`);
		}
		throw error;
	}

	let config: unknown;
	try {
		config = JSON.parse(text);
	} catch {
		return damaged(`${CONFIG} is not valid JSON.`);
	}
	if (
		typeof config !== "object" ||
		config === null ||
		!("formatVersion" in config) ||
		typeof config.formatVersion !== "number" ||
		!Number.isInteger(config.formatVersion) ||
		config.formatVersion <= 0
	) {
		return damaged(`${CONFIG} must have a positive integer formatVersion.`);
	}

	const readOnly = config.formatVersion > VAULT_FORMAT_VERSION;
	const warnings: string[] = readOnly
		? ["This vault uses a newer format and has been opened read-only."]
		: [];
	for (const folder of FOLDERS) {
		const path = `${ROOT}/${folder}`;
		if ((await host.kindOf(path)) === null) {
			if (readOnly) {
				warnings.push(`Missing folder: ${path}.`);
			} else {
				await host.makeFolder(path);
				warnings.push(`Recreated missing folder: ${path}.`);
			}
		}
	}
	return { status: readOnly ? "read-only" : "opened", warnings, problems: [] };
}

/** Match the reserved root folder using the host's name comparison rules. */
export function isInsideVaultOps(path: string): boolean {
	const check = checkVaultPath(path);
	return check.ok && nameKey(check.parts[0] ?? "") === nameKey(ROOT);
}
