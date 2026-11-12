import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { DRAFT_KEY, DRAFT_SAVE_DELAY_MS, emptyDraft, readDraft, writeDraft, type Draft } from './draft-data';
import { useSession } from './session';

export { emptyDraft, type Draft };

type DraftStore = {
  draft: Draft; update(patch: Partial<Draft>): void; clear(): void;
  /** Bumped each time a stored draft was loaded (launch / account switch), so the leave screen can resync its local UI state. */
  restored: number;
};
const DraftContext = createContext<DraftStore | null>(null);

/** Serialized read-modify-write of the per-account draft doc; failures are ignored (a draft is a convenience). */
let queue: Promise<void> = Promise.resolve();
function persist(account: string, draft: Draft): Promise<void> {
  const next = queue.then(async () => {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    await AsyncStorage.setItem(DRAFT_KEY, writeDraft(raw, account, draft));
  }).catch(() => undefined);
  queue = next;
  return next;
}

/**
 * The 留下 draft. Kept in memory across tab switches and persisted per account (`Session.accountKey`) at `liuda-draft-v1`,
 * debounced while typing and flushed when the app goes to the background, so it survives an app kill. The photo is stored
 * as its local file uri only (no base64). `clear()` (after a successful post or 清空草稿) removes it from disk at once.
 * Signed out: memory only.
 */
export function DraftProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const account = session?.accountKey ?? '';
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [restored, setRestored] = useState(0);
  /** Unsaved change: which account it belongs to and the draft to write. */
  const pending = useRef<{ account: string; draft: Draft } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const job = pending.current;
    pending.current = null;
    return job ? persist(job.account, job.draft) : queue;
  }, []);

  // Another account: write what the old one had, then show the new account's stored draft.
  const [shownAccount, setShownAccount] = useState(account);
  if (shownAccount !== account) { setShownAccount(account); setDraft(emptyDraft); setLoadedFor(null); }
  useEffect(() => {
    let active = true;
    if (!account) return;
    flush().then(() => AsyncStorage.getItem(DRAFT_KEY)).then(raw => {
      if (!active) return;
      setDraft(readDraft(raw, account));
      setLoadedFor(account);
      setRestored(n => n + 1);
    }).catch(() => { if (active) setLoadedFor(account); });
    return () => { active = false; };
  }, [account, flush]);

  // Debounced write after every change (never before this account's stored draft was read, so it is not overwritten).
  useEffect(() => {
    if (!account || loadedFor !== account) return;
    pending.current = { account, draft };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { flush(); }, DRAFT_SAVE_DELAY_MS);
  }, [account, loadedFor, draft, flush]);

  // Leaving the app (or being killed from the background) must not lose the last keystrokes.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') flush(); });
    return () => { sub.remove(); flush(); };
  }, [flush]);

  const update = useCallback((patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch })), []);
  const clear = useCallback(() => {
    setDraft(emptyDraft);
    if (account && loadedFor === account) { pending.current = { account, draft: emptyDraft }; flush(); }
  }, [account, loadedFor, flush]);
  const value = useMemo(() => ({ draft, update, clear, restored }), [draft, update, clear, restored]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

/** `{ draft, update(patch), clear(), restored }` — the leave screen's draft, kept across tab switches and app restarts. */
export function useDraft(): DraftStore {
  const value = useContext(DraftContext);
  if (!value) throw new Error('DraftProvider is required');
  return value;
}
