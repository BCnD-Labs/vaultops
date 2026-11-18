import { useSyncExternalStore } from "react";
import {
	FEATURES,
	type FeatureState,
	featureSettingKey,
	isEnabled,
} from "../core/features/registry";
import { settings } from "./settings";

type Key = Parameters<typeof settings.get>[0];

/** The stored on/off choice of every switchable feature, read from the settings. */
export function featureState(): FeatureState {
	const state: Record<string, boolean> = {};
	for (const feature of FEATURES) {
		if (feature.core) continue;
		state[feature.id] = settings.get(
			featureSettingKey(feature.id) as Key,
		) as boolean;
	}
	return state;
}

/** Whether a feature is on right now (for code outside React). */
export const featureEnabled = (id: string) => isEnabled(id, featureState());

// The snapshot must be the same object until a setting changes, or React loops.
let cached: { text: string; state: FeatureState } | null = null;
function snapshot(): FeatureState {
	const state = featureState();
	const text = JSON.stringify(state);
	if (cached?.text !== text) cached = { text, state };
	return cached.state;
}

const subscribe = (onChange: () => void) =>
	settings.subscribe(() => onChange());

/** Every feature's state; the component redraws when one is switched. */
export function useFeatures(): {
	state: FeatureState;
	isEnabled: (id: string) => boolean;
} {
	const state = useSyncExternalStore(subscribe, snapshot, snapshot);
	return { state, isEnabled: (id) => isEnabled(id, state) };
}

/** Whether one feature is on; the component redraws when it is switched. */
export function useFeature(id: string): boolean {
	return useFeatures().isEnabled(id);
}
