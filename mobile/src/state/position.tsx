import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api, type GeoPoint, type PositionEvidence } from '../api';
import { isFresh } from '../domain/gate';
import { distanceMeters, isPoint, pointToward } from '../domain/geo';
import { freshOrWait } from '../domain/refresh';
import { readOnce } from '../location/device';
import {
  canReadGps, getLocationPermission, permissionMessage, requestLocationPermission, requestTemporaryFullAccuracy, type LocationPermission,
} from '../location/permission';
import { startGpsWatch } from '../location/source';

export type { LocationPermission };
export type PositionMode = 'gps' | 'simulated';

export const POSITION_KEY = 'liuda-position-v1';
/** Simulated start when the mock has no anchor yet (UIBE area, legacy `miniprogram/data/demo.js`). */
export const SIMULATED_ORIGIN: GeoPoint = { latitude: 39.9786, longitude: 116.4215 };
const SIMULATED_ACCURACY = 5;

type PositionStore = {
  mode: PositionMode; setMode(m: PositionMode): void; fix: PositionEvidence | null;
  fresh: boolean; permission: LocationPermission; tracking: boolean; notice: string;
  requestPermission(): Promise<LocationPermission>; refresh(): Promise<PositionEvidence | null>;
  /** iOS approximate location: asks for temporary 精确位置 for this session; resolves the resulting permission. */
  requestFullAccuracy(): Promise<LocationPermission>;
  /** A fix fit for a write right now: the current one if fresh, else one new reading (bounded wait); null if none. */
  freshFix(): Promise<PositionEvidence | null>;
  simulateAt(p: GeoPoint): void; simulateNear(target: GeoPoint, metresFromTarget: number): void;
};
type Internal = { acquire(): () => void; watching: boolean };

const PositionContext = createContext<PositionStore | null>(null);
const InternalContext = createContext<Internal | null>(null);

/** Simulated fixes carry the time they were set; re-stamp right before sending one to the API. */
export function stampPosition(pos: PositionEvidence): PositionEvidence {
  return pos.source === 'simulated' ? { ...pos, timestamp: Date.now() } : pos;
}

function simulatedFix(point: GeoPoint, timestamp: number): PositionEvidence {
  return { latitude: point.latitude, longitude: point.longitude, crs: 'wgs84', accuracy: SIMULATED_ACCURACY, timestamp, source: 'simulated' };
}

/**
 * One global position (§4): real GPS (tracked only while a `useTrackWhileFocused` screen is focused and the app is
 * active) or 模拟位置 (stored point, `source: 'simulated'`). Persists `{ mode, simulated }` at `liuda-position-v1`.
 */
export function PositionProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [mode, setModeState] = useState<PositionMode>('gps');
  const [simulated, setSimulated] = useState<{ point: GeoPoint; at: number } | null>(null);
  const [gpsFix, setGpsFix] = useState<PositionEvidence | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [permission, setPermission] = useState<LocationPermission>('undetermined');
  const [permissionKnown, setPermissionKnown] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [consumers, setConsumers] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const prompted = useRef(false);
  const latest = useRef({ mode, simulated, gpsFix, permission });
  useEffect(() => { latest.current = { mode, simulated, gpsFix, permission }; });

  // Load persisted mode + simulated point.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(POSITION_KEY).then(raw => {
      if (!active || !raw) return;
      const value = JSON.parse(raw) as { mode?: unknown; simulated?: unknown };
      if (isPoint(value.simulated)) setSimulated({ point: { latitude: value.simulated.latitude, longitude: value.simulated.longitude }, at: Date.now() });
      if (value.mode === 'simulated' && isPoint(value.simulated)) setModeState('simulated');
    }).catch(() => undefined).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  // Persist after load.
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(POSITION_KEY, JSON.stringify({ mode, simulated: simulated?.point ?? null })).catch(() => undefined);
  }, [loaded, mode, simulated]);

  // Permission now and whenever the app returns to the foreground (the user may come back from Settings).
  const checkPermission = useCallback(async () => {
    const next = await getLocationPermission();
    setPermission(next);
    setPermissionKnown(true);
    return next;
  }, []);
  useEffect(() => {
    getLocationPermission().then(next => { setPermission(next); setPermissionKnown(true); });
    const sub = AppState.addEventListener('change', state => {
      setAppActive(state === 'active');
      if (state === 'active') checkPermission();
    });
    return () => sub.remove();
  }, [checkPermission]);

  const requestPermission = useCallback(async () => {
    prompted.current = true;
    const next = await requestLocationPermission();
    setPermission(next);
    setPermissionKnown(true);
    return next;
  }, []);

  const watching = consumers > 0 && appActive;
  const tracking = loaded && watching && mode === 'gps' && canReadGps(permission);

  // Ask once per launch when a tracking screen is focused and the user was never asked.
  useEffect(() => {
    if (loaded && watching && mode === 'gps' && permissionKnown && permission === 'undetermined' && !prompted.current) requestPermission();
  }, [loaded, watching, mode, permissionKnown, permission, requestPermission]);

  useEffect(() => {
    if (!tracking) return;
    const stop = startGpsWatch({
      onFix: fix => { setGpsFix(fix); setGpsError(''); },
      onError: message => setGpsError(message),
    });
    return () => { stop(); setGpsError(''); };
  }, [tracking]);

  // `fresh` is re-evaluated every second while a GPS fix exists.
  useEffect(() => {
    if (mode !== 'gps' || !gpsFix) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [mode, gpsFix]);

  const fix = useMemo(() => mode === 'simulated'
    ? simulated ? simulatedFix(simulated.point, simulated.at) : null
    : gpsFix, [mode, simulated, gpsFix]);
  const fresh = mode === 'simulated' ? !!simulated : isFresh(gpsFix, Math.max(now, gpsFix?.timestamp ?? 0));

  const simulateAt = useCallback((p: GeoPoint) => {
    if (!isPoint(p)) return;
    setSimulated({ point: { latitude: p.latitude, longitude: p.longitude }, at: Date.now() });
    setModeState('simulated');
  }, []);

  const simulateNear = useCallback((target: GeoPoint, metresFromTarget: number) => {
    const { mode: m, simulated: sim, gpsFix: gps } = latest.current;
    const from = (m === 'simulated' ? sim?.point : gps) ?? sim?.point ?? gps ?? target;
    simulateAt(pointToward(from, target, Math.max(0, metresFromTarget)));
  }, [simulateAt]);

  /** One GPS reading into `gpsFix` (prompts if never asked); null without permission or on failure. */
  const readGps = useCallback(async (): Promise<PositionEvidence | null> => {
    let p = latest.current.permission;
    if (p === 'undetermined') p = await requestPermission();
    else p = await checkPermission();
    if (!canReadGps(p)) return null;
    try {
      const next = await readOnce();
      setGpsFix(current => current && current.timestamp > next.timestamp ? current : next);
      setGpsError('');
      return next;
    } catch (error) {
      setGpsError(error instanceof Error ? error.message : '暂时无法定位。');
      return null;
    }
  }, [checkPermission, requestPermission]);

  const refresh = useCallback(async (): Promise<PositionEvidence | null> => {
    const { mode: m, simulated: sim } = latest.current;
    if (m === 'simulated') {
      if (!sim) return null;
      const at = Date.now();
      setSimulated({ point: sim.point, at });
      return simulatedFix(sim.point, at);
    }
    return readGps();
  }, [readGps]);

  const setMode = useCallback((next: PositionMode) => {
    if (next === 'gps') {
      const wasSimulated = latest.current.mode === 'simulated';
      setModeState('gps');
      // Back to 真实定位: the last GPS fix may be minutes old. Ask for a fresh one now (an explicit user action, so this is
      // fine even on screens that do not track), instead of showing 定位已过期 until 我在现场 is tapped.
      if (wasSimulated && canReadGps(latest.current.permission)) readGps();
      return;
    }
    if (latest.current.simulated) { setModeState('simulated'); return; }
    // First switch: start at the mock's seed anchor, else the UIBE origin.
    api.demoSettings({}).then(s => s.anchor, () => null).then(anchor => {
      if (latest.current.simulated) setModeState('simulated');
      else simulateAt(anchor && isPoint(anchor) ? anchor : SIMULATED_ORIGIN);
    });
  }, [simulateAt, readGps]);

  const requestFullAccuracy = useCallback(async () => {
    const next = await requestTemporaryFullAccuracy();
    setPermission(next);
    setPermissionKnown(true);
    return next;
  }, []);

  const freshFix = useCallback(async (): Promise<PositionEvidence | null> => {
    const { mode: m, simulated: sim, gpsFix: gps } = latest.current;
    if (m === 'simulated') return sim ? simulatedFix(sim.point, Date.now()) : null;
    return freshOrWait(gps, refresh);
  }, [refresh]);

  let notice = '';
  if (mode === 'gps') {
    if (tracking && gpsError) notice = gpsError;
    else if (tracking && !gpsFix) notice = '正在定位…';
    else if (tracking && !fresh) notice = '位置已过期，正在刷新…';
    else if (permission === 'granted-reduced') notice = permissionMessage(permission);
  }

  const acquire = useCallback(() => {
    let released = false;
    setConsumers(c => c + 1);
    return () => {
      if (released) return;
      released = true;
      setConsumers(c => Math.max(0, c - 1));
    };
  }, []);

  const value = useMemo<PositionStore>(() => ({
    mode, setMode, fix, fresh, permission, tracking, notice, requestPermission, refresh, requestFullAccuracy, freshFix, simulateAt, simulateNear,
  }), [mode, setMode, fix, fresh, permission, tracking, notice, requestPermission, refresh, requestFullAccuracy, freshFix, simulateAt, simulateNear]);
  const internal = useMemo(() => ({ acquire, watching }), [acquire, watching]);
  return <InternalContext.Provider value={internal}><PositionContext.Provider value={value}>{children}</PositionContext.Provider></InternalContext.Provider>;
}

/**
 * Global position: `{ mode, setMode, fix, fresh, permission, tracking, notice, requestPermission, refresh, simulateAt, simulateNear }`.
 * - `fix`: newest GPS fix (never silently cleared when stale) or the simulated point (`accuracy: 5`).
 * - `fresh`: GPS age ≤15 s (re-evaluated every 1 s); always true in simulated mode.
 * - `simulateAt` / `simulateNear(target, m)` also switch to 模拟位置. 模拟走近 = `simulateNear(post, 120)`, 模拟到场 = `simulateNear(post, 8)`.
 * - `refresh()` reads once (prompting if never asked); returns null without permission.
 * - `freshFix()` = current fix if fresh, else waits (≤8 s) for one new reading; never returns a stale GPS fix.
 * - `requestFullAccuracy()` = iOS temporary 精确位置 prompt when only approximate location is allowed.
 */
export function usePosition(): PositionStore {
  const value = useContext(PositionContext);
  if (!value) throw new Error('PositionProvider is required');
  return value;
}

function useInternal(): Internal {
  const value = useContext(InternalContext);
  if (!value) throw new Error('PositionProvider is required');
  return value;
}

/** True while at least one `useTrackWhileFocused` screen is focused and the app is active (stores use it to poll). */
export function usePositionWatching(): boolean {
  return useInternal().watching;
}

/**
 * Ref-counted: while the calling screen is focused (and the app active) GPS tracking runs in `gps` mode (D-12).
 * Use on discover, place detail (non-participant) and leave; never on participant threads, messages or chat.
 */
export function useTrackWhileFocused(enabled: boolean = true): void {
  const { acquire } = useInternal();
  useFocusEffect(useCallback(() => (enabled ? acquire() : undefined), [enabled, acquire]));
}

/**
 * The current fix, but only replaced when it moved ≥ `minMeters`, its accuracy changed by ≥10 m, or the source changed.
 * Lets stores refetch on meaningful movement instead of on every GPS update.
 */
export function useSignificantFix(minMeters: number = 10): PositionEvidence | null {
  const { fix } = usePosition();
  const [kept, setKept] = useState<PositionEvidence | null>(fix);
  const significant = fix !== kept && (!fix || !kept || fix.source !== kept.source
    || distanceMeters(fix, kept) >= minMeters || Math.abs((fix.accuracy ?? 999) - (kept.accuracy ?? 999)) >= 10);
  if (significant) setKept(fix);
  return significant ? fix : kept;
}
