/** Collapse preferences are scoped to the vault and optional when storage fails. */
export function noteSections(vault: string, next?: string[]): string[] {
	try {
		const key = `vaultops:note-sections:${vault}`;
		if (next) localStorage.setItem(key, JSON.stringify(next));
		const value: unknown =
			next ?? JSON.parse(localStorage.getItem(key) ?? "[]");
		if (Array.isArray(value) && value.every((item) => typeof item === "string"))
			return value;
	} catch {
		// Keep the current session usable without persistence.
	}
	return next ?? [];
}
