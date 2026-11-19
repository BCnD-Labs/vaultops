import { useEffect, useMemo, useRef } from "react";
import type { Answers, FormConfig } from "../core/notes/forms";
import type { Props } from "../core/notes/properties";
import type { FormSource } from "../editor/form-block";

/** What the app offers form blocks that create notes. */
export interface FormsApi {
	canCreate: boolean;
	folders: string[];
	templates: () => Promise<{ label: string }[]>;
	/** Resolves to a plain-words problem, or null when the note was made. */
	create: (request: {
		config: FormConfig;
		answers: Answers;
	}) => Promise<string | null>;
}

/**
 * The open note as a form block sees it. The source keeps one identity and
 * reads the latest values, and tells the blocks to redraw when they change;
 * answers are saved through `onProps`, the note session's own save path.
 */
export function useFormSource(input: {
	props: Props | null;
	editable: boolean;
	onProps: (next: Props) => void;
	api?: FormsApi;
}): FormSource {
	const latest = useRef(input);
	latest.current = input;
	const listeners = useRef(new Set<() => void>());
	const source = useMemo<FormSource>(
		() => ({
			props: () => latest.current.props,
			editable: () => latest.current.editable,
			setProps: (next) => latest.current.onProps(next),
			subscribe: (listener) => {
				listeners.current.add(listener);
				return () => void listeners.current.delete(listener);
			},
			templates: async () => (await latest.current.api?.templates()) ?? [],
			folders: () => latest.current.api?.folders ?? [],
			canCreate: () => latest.current.api?.canCreate === true,
			create: async (request) =>
				latest.current.api
					? latest.current.api.create(request)
					: "Creating notes isn't available here.",
		}),
		[],
	);
	const canCreate = input.api?.canCreate;
	// biome-ignore lint/correctness/useExhaustiveDependencies: these values are what the blocks redraw for.
	useEffect(() => {
		for (const listener of listeners.current) listener();
	}, [input.props, input.editable, canCreate]);
	return source;
}
