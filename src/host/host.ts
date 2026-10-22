/**
 * The only door between app code and the operating system.
 * Every native call (files, git, dialogs, watching) goes through this
 * interface, so the desktop shell can be swapped and tests can use a fake.
 * File operations and the fake host are added in task T03.
 */
export interface AppInfo {
	name: string;
	version: string;
}

export interface Host {
	appInfo(): Promise<AppInfo>;
}
