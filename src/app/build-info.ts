declare const __BUILD_COMMIT__: string | undefined;

/**
 * The short commit this app was built from (set by vite.config.ts), shown in
 * the status bar so an update can be seen to have landed. `null` where the
 * build did not set it, such as in unit tests.
 */
export const buildCommit: string | null =
	typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : null;
