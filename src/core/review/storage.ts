import type { Host } from "../../host/host";
import { copyToRecovery } from "../notes/trash";
import type { ReviewState } from "./scheduler";

export const REVIEW_FILE = ".vaultops/review.json";
const empty = (): ReviewState => ({ version: 1, items: {} });

function parse(text: string): ReviewState | null {
	try {
		const value: unknown = JSON.parse(text);
		if (typeof value !== "object" || value === null || Array.isArray(value))
			return null;
		const data = value as Record<string, unknown>;
		if (
			data.version !== 1 ||
			typeof data.items !== "object" ||
			data.items === null ||
			Array.isArray(data.items)
		)
			return null;
		return data as unknown as ReviewState;
	} catch {
		return null;
	}
}

export async function loadReview(host: Host): Promise<ReviewState> {
	if ((await host.kindOf(REVIEW_FILE)) === null) return empty();
	const state = parse(await host.readText(REVIEW_FILE));
	if (!state) throw new Error("The review file could not be read.");
	return state;
}

export async function saveReview(
	host: Host,
	state: ReviewState,
	now = new Date(),
): Promise<{ recoveryPath?: string }> {
	await host.makeFolder(".vaultops");
	let recoveryPath: string | undefined;
	const kind = await host.kindOf(REVIEW_FILE);
	if (kind !== null) {
		const text = await host.readText(REVIEW_FILE);
		const previous = parse(text);
		if (!previous) {
			// A future version must not be treated as corruption.
			try {
				const data: unknown = JSON.parse(text);
				if (
					typeof data === "object" &&
					data !== null &&
					"version" in data &&
					typeof data.version === "number" &&
					data.version > 1
				)
					throw new Error("The review file belongs to a newer app version.");
			} catch (error) {
				if (error instanceof Error && error.message.includes("newer app"))
					throw error;
			}
			({ recoveryPath } = await copyToRecovery(host, text, "review.json", now));
		} else {
			state = {
				...previous,
				...state,
				items: { ...previous.items, ...state.items },
			};
		}
	}
	await host.writeTextAtomic(
		REVIEW_FILE,
		`${JSON.stringify(state, null, 2)}\n`,
	);
	return recoveryPath ? { recoveryPath } : {};
}
