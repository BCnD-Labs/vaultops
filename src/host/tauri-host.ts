import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
	type AppInfo,
	type BuildInfo,
	type DirEntry,
	type EntryKind,
	type GitInfo,
	HOST_ERROR_CODES,
	type Host,
	HostError,
	type HostErrorCode,
	type UpdateChannels,
	type UpdateScriptStatus,
	VCS_ERROR_CODES,
	VcsError,
	type VcsErrorCode,
	type VcsStatus,
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

/** The same for version-control commands, which reject with `{ code, message }` from git_ops.rs. */
export function toVcsError(raw: unknown): VcsError {
	if (raw instanceof VcsError) return raw;
	if (raw && typeof raw === "object" && "code" in raw && "message" in raw) {
		const { code, message } = raw as { code: unknown; message: unknown };
		if (
			typeof message === "string" &&
			(VCS_ERROR_CODES as readonly unknown[]).includes(code)
		) {
			return new VcsError(code as VcsErrorCode, message);
		}
	}
	return new VcsError("io", "the app's native side could not do that");
}

async function vcsCall<T>(
	command: string,
	args?: Record<string, unknown>,
): Promise<T> {
	try {
		return await invoke<T>(command, args);
	} catch (raw) {
		throw toVcsError(raw);
	}
}

/** Raw bytes from Rust arrive as an ArrayBuffer (or, in older shells, a number list). */
const toBuffer = (bytes: ArrayBuffer | number[]): ArrayBuffer =>
	Array.isArray(bytes) ? Uint8Array.from(bytes).buffer : bytes;

/** The real host: forwards each call to a Rust command in src-tauri/src/lib.rs. */
export const tauriHost: Host = {
	appInfo: () => call<AppInfo>("app_info"),
	vcs: {
		detect: () => vcsCall<GitInfo>("vcs_detect"),
		status: () => vcsCall<VcsStatus>("vcs_status"),
		enable: (name) => vcsCall<VcsStatus>("vcs_enable", { name }),
	},
	chooseVault: () => call<string | null>("choose_vault"),
	currentVault: () => call<string | null>("current_vault"),
	readText: (path) => call<string>("read_text", { path }),
	readCover: async (path) =>
		toBuffer(await call<ArrayBuffer | number[]>("read_cover", { path })),
	chooseCover: () => call<string | null>("choose_cover"),
	chooseImage: () => call<string | null>("choose_image"),
	// Like writeCache: raw bytes as the body, the file name in a header.
	importAttachment: async (name, bytes) => {
		try {
			return await invoke<string>("import_attachment", new Uint8Array(bytes), {
				headers: { "x-attachment-name": name },
			});
		} catch (raw) {
			throw toHostError(raw);
		}
	},
	readCache: async (path) => {
		try {
			return toBuffer(
				await call<ArrayBuffer | number[]>("read_cache", { path }),
			);
		} catch (error) {
			if (error instanceof HostError && error.code === "not-found") return null;
			throw error;
		}
	},
	// The bytes travel as the raw request body; the path rides in a header.
	writeCache: async (path, bytes) => {
		try {
			await invoke("write_cache", new Uint8Array(bytes), {
				headers: { "x-cache-path": path },
			});
		} catch (raw) {
			throw toHostError(raw);
		}
	},
	writeTextAtomic: (path, text) =>
		call<void>("write_text_atomic", { path, text }),
	move: (from, to) => call<void>("move_entry", { from, to }),
	list: (folder) => call<DirEntry[]>("list", { folder }),
	makeFolder: (path) => call<void>("make_folder", { path }),
	kindOf: (path) => call<EntryKind | null>("kind_of", { path }),
	removeTrashed: (path) => call<void>("remove_trashed", { path }),
	// The close is prevented unless the handler says it is fine; Tauri closes the
	// window itself afterwards when nothing prevented it.
	appendLog: (lines) => call<void>("append_log", { lines }),
	readAppFile: (name) => call<string | null>("read_app_file", { name }),
	writeAppFile: (name, text) => call<void>("write_app_file", { name, text }),
	readLogTail: (maxLines) => call<string>("read_log_tail", { maxLines }),
	chooseReportsFolder: () => call<string | null>("choose_reports_folder"),
	reportsFolder: () => call<string | null>("reports_folder"),
	writeReport: (name, text) => call<void>("write_report", { name, text }),
	startUpdateScript: (channel) =>
		call<void>("start_update_script", { channel }),
	updateScriptStatus: () => call<UpdateScriptStatus>("update_script_status"),
	buildInfo: () => call<BuildInfo>("build_info"),
	updateChannels: () => call<UpdateChannels>("update_channels"),
	onCloseRequested: (handler) =>
		getCurrentWindow().onCloseRequested(async (event) => {
			if (!(await handler())) event.preventDefault();
		}),
};
