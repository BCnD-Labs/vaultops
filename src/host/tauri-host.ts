import { invoke } from "@tauri-apps/api/core";
import {
	type AppInfo,
	type DirEntry,
	type EntryKind,
	HOST_ERROR_CODES,
	type Host,
	HostError,
	type HostErrorCode,
} from "./host";

/**
 * Turn whatever a Rust command rejected with into a HostError. Rust sends
 * `{ code, message }` (src-tauri/src/host_error.rs); anything else, such as a
 * missing permission or command, becomes an "io" error.
 */
export function toHostError(raw: unknown): HostError {
	if (raw instanceof HostError) return raw;
	if (raw && typeof raw === "object" && "code" in raw && "message" in raw) {
		const { code, message } = raw as { code: unknown; message: unknown };
		if (
			typeof message === "string" &&
			(HOST_ERROR_CODES as readonly unknown[]).includes(code)
		) {
			return new HostError(code as HostErrorCode, message);
		}
	}
	return new HostError("io", "the app's native side could not do that");
}

async function call<T>(
	command: string,
	args?: Record<string, unknown>,
): Promise<T> {
	try {
		return await invoke<T>(command, args);
	} catch (raw) {
		throw toHostError(raw);
	}
}

/** The real host: forwards each call to a Rust command in src-tauri/src/lib.rs. */
export const tauriHost: Host = {
	appInfo: () => call<AppInfo>("app_info"),
	chooseVault: () => call<string | null>("choose_vault"),
	readText: (path) => call<string>("read_text", { path }),
	writeTextAtomic: (path, text) =>
		call<void>("write_text_atomic", { path, text }),
	move: (from, to) => call<void>("move_entry", { from, to }),
	list: (folder) => call<DirEntry[]>("list", { folder }),
	makeFolder: (path) => call<void>("make_folder", { path }),
	kindOf: (path) => call<EntryKind | null>("kind_of", { path }),
};
