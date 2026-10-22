import { invoke } from "@tauri-apps/api/core";
import type { AppInfo, Host } from "./host";

/** The real host: forwards each call to a Rust command in src-tauri. */
export const tauriHost: Host = {
	appInfo: () => invoke<AppInfo>("app_info"),
};
