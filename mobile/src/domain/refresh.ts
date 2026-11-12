// Pure scheduling rules for tiered reads (feed, thread) and for "use a fresh fix" decisions. No React, no timers kept.
import type { PositionEvidence } from '../api/types.ts';
import { isFresh } from './gate.ts';

/** Refetch this long before `readExpiresAt` so a new snapshot replaces the old one before it has to collapse. */
export const REFETCH_LEAD_MS = 3000;
/** How long `freshFix` waits for a new GPS reading before giving up. */
export const FRESH_FIX_TIMEOUT_MS = 8000;

export type ExpiryPlan = {
  /** ms until the early refetch (old snapshot stays visible meanwhile); null when the window is too short for one. */
  refetchIn: number | null;
  /** ms until the client must collapse the snapshot (just after `readExpiresAt`); null when nothing expires. */
  collapseIn: number | null;
  /** Refetch once more at collapse time (covers a failed / skipped early refetch). Never true for an already-expired read. */
  refetchOnCollapse: boolean;
};

/**
 * Timers for one snapshot that expires at `expiresAt` (0 = never). A read that arrives already expired collapses once
 * and is not refetched (no loop on a stale fix); otherwise refetch `lead` ms early, and once more at expiry.
 */
export function expiryPlan(expiresAt: number, now: number, lead: number = REFETCH_LEAD_MS): ExpiryPlan {
  if (!expiresAt || !Number.isFinite(expiresAt)) return { refetchIn: null, collapseIn: null, refetchOnCollapse: false };
  const left = expiresAt - now;
  if (left <= 0) return { refetchIn: null, collapseIn: 0, refetchOnCollapse: false };
  return { refetchIn: left > lead ? left - lead : null, collapseIn: left + 50, refetchOnCollapse: true };
}

/** A fix worth sending with a tiered read: simulated always, GPS only while fresh (≤15 s) — a stale one only earns STALE_LOCATION. */
export function usableFix(fix: PositionEvidence | null | undefined, now: number): fix is PositionEvidence {
  return !!fix && isFresh(fix, now);
}

/** After fetches were skipped (or failed STALE_LOCATION) for want of a fresh fix, refetch as soon as one is fresh again. */
export function refetchWhenFresh(s: { fresh: boolean; skipped: boolean; errorCode: string | null | undefined }): boolean {
  return s.fresh && (s.skipped || s.errorCode === 'STALE_LOCATION');
}

/**
 * Current fix if usable, otherwise one new reading from `reread` — bounded by `timeoutMs` — and only if that one is
 * usable. Resolves null instead of handing a stale fix to a write.
 */
export async function freshOrWait(
  current: PositionEvidence | null, reread: () => Promise<PositionEvidence | null>,
  now: () => number = Date.now, timeoutMs: number = FRESH_FIX_TIMEOUT_MS,
): Promise<PositionEvidence | null> {
  if (usableFix(current, now())) return current;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); });
  try {
    const next = await Promise.race([reread().catch(() => null), timeout]);
    return usableFix(next, now()) ? next : null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether the place detail keeps GPS tracking on (and with it the 2 s refresher that keeps a standing-still fix fresh).
 * Non-participants track from the moment the screen opens — also while the thread is still loading, so the fix never
 * goes stale in that gap. Participants never start GPS unless they ask (我在现场，更新位置; thread-continuation); while
 * loading, a post already known to be mine/joined (`knownParticipant`, from the inbox or feed) is treated the same.
 */
export function placeWantsTracking(s: {
  updateRequested: boolean; participated: boolean | null; knownParticipant: boolean; errorCode: string | null | undefined;
}): boolean {
  if (s.updateRequested) return true;
  if (s.participated !== null) return !s.participated;
  return !s.knownParticipant && s.errorCode !== 'POST_MISSING';
}
