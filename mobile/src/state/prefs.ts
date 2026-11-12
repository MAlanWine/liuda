import AsyncStorage from '@react-native-async-storage/async-storage';

/** Persisted UI preferences (`liuda-ui-prefs-v1`). */
export type UiPrefs = { discoverView: 'cards' | 'map'; sort: 'recommended' | 'latest' };
export const PREFS_KEY = 'liuda-ui-prefs-v1';
export const defaultPrefs: UiPrefs = { discoverView: 'cards', sort: 'recommended' };

/** Reads prefs; unknown or broken values fall back to defaults. */
export async function loadPrefs(): Promise<UiPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    const value = raw ? JSON.parse(raw) as Partial<UiPrefs> : {};
    return {
      discoverView: value.discoverView === 'map' ? 'map' : 'cards',
      sort: value.sort === 'latest' ? 'latest' : 'recommended',
    };
  } catch {
    return { ...defaultPrefs };
  }
}

/** Merges and writes prefs (fire-and-forget safe; failures are ignored — prefs are a convenience). */
export async function savePrefs(patch: Partial<UiPrefs>): Promise<void> {
  try {
    const next = { ...await loadPrefs(), ...patch };
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // Preferences are optional.
  }
}
