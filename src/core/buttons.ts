export interface ButtonAction {
	action: "command" | "insert-template" | "new-note-template";
	target: string;
}

export const REMOVED_BUTTON_TARGET =
	"This button points at something that was removed";

export function resolveButtonTarget<T>(
	target: string,
	options: readonly T[],
	key: (option: T) => string,
): T | undefined {
	return target ? options.find((option) => key(option) === target) : undefined;
}
