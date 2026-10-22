import { invoke } from "@tauri-apps/api/core";
import { type AppInfo, type Host, HostError } from "./host";

const notYet = (op: string) => () =>
	Promise.reject(
		new HostError(
			"io",
			`${op} is not available yet (Rust side arrives in T04)`,
		),
	);

/** The real host: forwards each call to a Rust command in src-tauri. */
export const tauriHost: Host = {
	appInfo: () => invoke<AppInfo>("app_info"),
	readText: notYet("readText"),
	writeTextAtomic: notYet("writeTextAtomic"),
	move: notYet("move"),
	list: notYet("list"),
	makeFolder: notYet("makeFolder"),
	kindOf: notYet("kindOf"),
};
