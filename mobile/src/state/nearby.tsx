import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, isApiError, type PostSummary } from '../api';
import { rank, type FeedSort } from '../domain/ranking';
import { expiryPlan, refetchWhenFresh, usableFix } from '../domain/refresh';
import { expireSummary } from '../domain/tiers';
import { canReadGps } from '../location/permission';
import { retryOnNetwork } from './actions';
import { emit, useBus } from './bus';
import { stampPosition, usePosition, usePositionWatching, useSignificantFix } from './position';
import { loadPrefs, savePrefs } from './prefs';
import { useSession } from './session';

export type { FeedSort };
export type DiscoverView = 'cards' | 'map';

type NearbyStore = {
  ready: boolean; loading: boolean; error: ApiError | null; posts: PostSummary[];
  /** Server capped the list (only the nearest/latest 50 returned). */
  limited: boolean;
  sort: FeedSort; setSort(s: FeedSort): void; view: DiscoverView; setView(v: DiscoverView): void;
  refresh(): Promise<void>; toggleBookmark(postId: string, saved: boolean): Promise<void>; reanchorHere(): Promise<void>;
};
const NearbyContext = createContext<NearbyStore | null>(null);

const toApiError = (error: unknown) => isApiError(error) ? error as ApiError : new ApiError('SERVICE_UNAVAILABLE');

/**
 * Posts around the global position (`nearby`). Refetches on sign-in, on moving ≥15 m, on `posts`/`demo` bus topics,
 * when a discover-type screen gains focus, and ~3 s before a tier read expires while such a screen is focused (the old
 * cards stay until the new list arrives; they collapse only if it has not by `readExpiresAt`). Never fetches with a
 * stale GPS fix (that only earns STALE_LOCATION): the skipped fetch runs as soon as the fix is fresh again, which also
 * clears a STALE_LOCATION error.
 */
export function NearbyProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const token = session?.token ?? null;
  const { fix, mode, permission, fresh } = usePosition();
  const watching = usePositionWatching();
  const moved = useSignificantFix(15);
  const [raw, setRaw] = useState<PostSummary[]>([]);
  const [limited, setLimited] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sort, setSortState] = useState<FeedSort>('recommended');
  const [view, setViewState] = useState<DiscoverView>('cards');
  const latest = useRef({ fix, token });
  useEffect(() => { latest.current = { fix, token }; });
  const seq = useRef(0);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    let active = true;
    loadPrefs().then(p => { if (active) { setSortState(p.sort); setViewState(p.discoverView); } });
    return () => { active = false; };
  }, []);

  const refresh = useCallback(async () => {
    const { fix: current, token: t } = latest.current;
    if (!t || !current) return;
    if (!usableFix(current, Date.now())) { setSkipped(true); return; }
    setSkipped(false);
    // A fresh fix is here: a STALE_LOCATION error from an older fix no longer applies.
    setError(e => e?.code === 'STALE_LOCATION' ? null : e);
    const id = ++seq.current;
    setLoading(true);
    try {
      const res = await retryOnNetwork(() => api.nearby({ position: stampPosition(current) }));
      if (id !== seq.current) return;
      setRaw(res.posts);
      setLimited(res.limited === true);
      setError(null);
      setNow(Date.now());
    } catch (e) {
      if (id === seq.current) setError(toApiError(e));
    } finally {
      if (id === seq.current) { setLoading(false); setAttempted(true); }
    }
  }, []);

  // Account switch: drop the old account's list.
  const [shownToken, setShownToken] = useState(token);
  if (shownToken !== token) { setShownToken(token); setRaw([]); setLimited(false); setAttempted(false); setError(null); setSkipped(false); }
  useEffect(() => { if (token && moved) refresh(); }, [token, moved, mode, refresh]);
  useEffect(() => { if (watching) refresh(); }, [watching, refresh]);
  useBus(['posts', 'demo', 'session'], () => { refresh(); });
  // A fetch was skipped for a stale fix (or failed STALE_LOCATION): run it once the fix is fresh again.
  const errorCode = error?.code ?? null;
  useEffect(() => {
    if (token && refetchWhenFresh({ fresh: fresh && usableFix(fix, Date.now()), skipped, errorCode })) refresh();
  }, [token, fresh, fix, skipped, errorCode, refresh]);

  // Refetch shortly before the earliest read expires (feed screen focused); collapse at expiry only if nothing replaced it.
  const nextExpiry = useMemo(() => raw.reduce((min, p) => p.readExpiresAt > now && p.readExpiresAt < min ? p.readExpiresAt : min, Infinity), [raw, now]);
  const canRefetch = watching;
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    const plan = expiryPlan(nextExpiry, Date.now());
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (canRefetch && plan.refetchIn !== null) timers.push(setTimeout(() => { refresh(); }, plan.refetchIn));
    if (plan.collapseIn !== null) {
      timers.push(setTimeout(() => { setNow(Date.now()); if (canRefetch && plan.refetchOnCollapse) refresh(); }, plan.collapseIn));
    }
    return () => timers.forEach(clearTimeout);
  }, [nextExpiry, canRefetch, refresh]);

  // Tiers are tightened with the live fix; staleness is covered by readExpiresAt (≤ fix time + 15 s).
  const posts = useMemo(() => rank(raw.map(p => expireSummary(p, now, fix)), sort, now), [raw, sort, now, fix]);

  const setSort = useCallback((s: FeedSort) => { setSortState(s); savePrefs({ sort: s }); }, []);
  const setView = useCallback((v: DiscoverView) => { setViewState(v); savePrefs({ discoverView: v }); }, []);

  const toggleBookmark = useCallback(async (postId: string, saved: boolean) => {
    await retryOnNetwork(() => api.bookmark({ postId, saved }));
    setRaw(list => list.map(p => p.id === postId ? { ...p, saved } : p));
    emit(`thread:${postId}`);
  }, []);

  const reanchorHere = useCallback(async () => {
    const current = latest.current.fix;
    if (!current) throw new ApiError('LOCATION_REQUIRED');
    await retryOnNetwork(() => api.demoReanchor({ center: { latitude: current.latitude, longitude: current.longitude } }));
    emit('demo');
  }, []);

  // Nothing to wait for when GPS mode has no way to get a fix.
  const blocked = mode === 'gps' && !fix && permission !== 'undetermined' && !canReadGps(permission);
  const ready = attempted || blocked;
  const value = useMemo(() => ({ ready, loading, error, posts, limited, sort, setSort, view, setView, refresh, toggleBookmark, reanchorHere }),
    [ready, loading, error, posts, limited, sort, setSort, view, setView, refresh, toggleBookmark, reanchorHere]);
  return <NearbyContext.Provider value={value}>{children}</NearbyContext.Provider>;
}

/**
 * Feed store: `{ ready, loading, error, posts, limited, sort, setSort, view, setView, refresh, toggleBookmark, reanchorHere }`.
 * `posts` already has `expireSummary` applied and is ranked by `sort`. `ready` = first fetch finished, or no fix is
 * obtainable (GPS denied / services off — show PermissionHelp). `reanchorHere` moves the demo seeds to the current fix.
 */
export function useNearby(): NearbyStore {
  const value = useContext(NearbyContext);
  if (!value) throw new Error('NearbyProvider is required');
  return value;
}
