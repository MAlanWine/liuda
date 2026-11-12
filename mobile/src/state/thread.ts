import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, isApiError, type ThreadView } from '../api';
import { expiryPlan, refetchWhenFresh, usableFix } from '../domain/refresh';
import { expireSummary } from '../domain/tiers';
import { retryOnNetwork } from './actions';
import { useBus } from './bus';
import { stampPosition, usePosition, useSignificantFix } from './position';
import { useSession } from './session';

const toApiError = (error: unknown) => isApiError(error) ? error as ApiError : new ApiError('SERVICE_UNAVAILABLE');

/**
 * One thread (`thread` action): `{ thread, loading, error, refresh }`. Sends the current fix when there is one
 * (participants are served without it). Non-participants refetch on moving ≥10 m. A read is refetched ~3 s before
 * `readExpiresAt` with the old snapshot kept on screen; it collapses (comments hidden below `full`) only if no new
 * snapshot arrived by then. Fetches while the screen is focused; on blur the text, comments and photo are dropped from
 * memory (thread-continuation: clear page content when hidden) and refetched on focus. Refetches on bus
 * `thread:<id>`, `session`, `demo`, and once a fresh fix replaces a stale one that failed STALE_LOCATION.
 * Does not start GPS — pair with `useTrackWhileFocused(!participated)` on the screen.
 */
export function useThread(postId: string): { thread: ThreadView | null; loading: boolean; error: ApiError | null; refresh(): Promise<void> } {
  const { session } = useSession();
  const token = session?.token ?? null;
  const { fix, fresh } = usePosition();
  const moved = useSignificantFix(10);
  const [data, setData] = useState<ThreadView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef({ fix, token, postId });
  useEffect(() => { latest.current = { fix, token, postId }; });
  const seq = useRef(0);
  const focused = useRef(false);

  const refresh = useCallback(async () => {
    const { fix: current, token: t, postId: id } = latest.current;
    if (!t || !id || !focused.current) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const res = await retryOnNetwork(() => api.thread({ postId: id, ...current ? { position: stampPosition(current) } : {} }));
      if (n !== seq.current) return;
      setData(res);
      setError(null);
      setNow(Date.now());
    } catch (e) {
      if (n !== seq.current) return;
      const err = toApiError(e);
      setError(err);
      if (err.code === 'POST_MISSING') setData(null);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);

  // Different post or account: drop the old view (adjusting state during render, not in an effect).
  const key = `${token ?? ''}|${postId}`;
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) { setShownKey(key); setData(null); setError(null); }

  // Post / account changed while focused: fetch again (declared before the focus effect, so the first mount fetches once).
  useEffect(() => { refresh(); }, [postId, token, refresh]);
  // Focus: fetch. Blur: forget the content and ignore late responses.
  useFocusEffect(useCallback(() => {
    focused.current = true;
    refresh();
    return () => {
      focused.current = false;
      seq.current += 1;
      setData(null);
      setLoading(false);
    };
  }, [refresh]));

  const participant = data?.post.participated === true;
  useEffect(() => { if (!participant && moved) refresh(); }, [participant, moved, refresh]);
  useBus([`thread:${postId}`, 'session', 'demo'], () => { refresh(); });
  const errorCode = error?.code ?? null;
  useEffect(() => {
    if (refetchWhenFresh({ fresh: fresh && usableFix(fix, Date.now()), skipped: false, errorCode })) refresh();
  }, [fresh, fix, errorCode, refresh]);

  const expiresAt = data?.post.readExpiresAt ?? 0;
  useEffect(() => {
    if (!data) return;
    const plan = expiryPlan(expiresAt, Date.now());
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (plan.refetchIn !== null) timers.push(setTimeout(() => { refresh(); }, plan.refetchIn));
    if (plan.collapseIn !== null) {
      timers.push(setTimeout(() => { setNow(Date.now()); if (plan.refetchOnCollapse) refresh(); }, plan.collapseIn));
    }
    return () => timers.forEach(clearTimeout);
  }, [data, expiresAt, refresh]);

  const thread = useMemo(() => {
    if (!data) return null;
    const post = expireSummary(data.post, now, fix);
    return { post, comments: post.level === 'full' ? data.comments : [] };
  }, [data, now, fix]);
  return { thread, loading, error, refresh };
}
