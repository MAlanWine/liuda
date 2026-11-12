import * as Location from 'expo-location';
import { AppState } from 'react-native';
import type { PositionEvidence } from '../api/types';
import { toEvidence } from './device';

/** A fix older than this is refreshed with a one-shot read (keeps a stationary user under the 15 s gate). */
export const REFRESH_AFTER_MS = 4_000;
const CHECK_EVERY_MS = 2_000;

export type GpsWatchHandlers = {
  /** Called with every new fix (watch updates and refresher reads), newest first by timestamp. */
  onFix: (fix: PositionEvidence) => void;
  /** Called with a short Chinese message when updates fail; the watch keeps retrying. */
  onError: (message: string) => void;
};

/**
 * Starts foreground GPS tracking (D-3): `watchPositionAsync` without `timeInterval` (Android-only on iOS),
 * plus a refresher that reads once when the newest fix is >4 s old (single in-flight) and on AppState `active`.
 * Returns a stop function; call it when the screen loses focus or the app goes to background (D-12).
 */
export function startGpsWatch({ onFix, onError }: GpsWatchHandlers): () => void {
  let stopped = false;
  let newest = 0;
  let inFlight = false;
  let subscription: Location.LocationSubscription | null = null;

  const accept = (value: Location.LocationObject) => {
    if (stopped) return;
    const fix = toEvidence(value);
    if (fix.timestamp < newest) return;
    newest = fix.timestamp;
    onFix(fix);
  };

  const refresh = () => {
    if (stopped || inFlight || Date.now() - newest <= REFRESH_AFTER_MS) return;
    inFlight = true;
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      .then(accept)
      .catch(() => { if (!stopped) onError('定位更新较慢，正在重试…'); })
      .finally(() => { inFlight = false; });
  };

  Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 0 }, accept, () => {
    if (!stopped) onError('定位更新中断，正在重试…');
  }).then(result => {
    if (stopped) result.remove();
    else subscription = result;
  }).catch(() => { if (!stopped) onError('暂时无法持续定位，正在重试…'); });

  refresh();
  const timer = setInterval(refresh, CHECK_EVERY_MS);
  const appState = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });

  return () => {
    stopped = true;
    clearInterval(timer);
    appState.remove();
    subscription?.remove();
    subscription = null;
  };
}
