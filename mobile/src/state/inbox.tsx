import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api, ApiError, isApiError, type ApiActions, type ChatMeta } from '../api';
import { retryOnNetwork } from './actions';
import { useBus } from './bus';
import { useSession } from './session';

export const INBOX_SEEN_KEY = 'liuda-inbox-seen-v1';
const POLL_MS = 15_000;

type Inbox = ApiActions['inbox']['res'];
type Seen = { replies: number; chats: number; chatIds: Record<string, number> };
type SeenDoc = Record<string, Seen>;
type InboxStore = {
  inbox: Inbox | null; loading: boolean; error: ApiError | null; refresh(): Promise<void>;
  unseen: { replies: number; chats: number }; markSeen(kind: 'replies' | 'chats'): void;
};
const InboxContext = createContext<InboxStore | null>(null);
const SeenContext = createContext<((chatId: string, at: number) => void) | null>(null);

const emptySeen: Seen = { replies: 0, chats: 0, chatIds: {} };
const toApiError = (error: unknown) => isApiError(error) ? error as ApiError : new ApiError('SERVICE_UNAVAILABLE');
const chatActivity = (c: ChatMeta) => Math.max(c.updatedAt, c.lastMessageAt ?? 0);

function readSeen(doc: SeenDoc, account: string): Seen {
  const s = doc[account];
  if (!s || typeof s !== 'object') return emptySeen;
  return {
    replies: Number.isFinite(s.replies) ? s.replies : 0,
    chats: Number.isFinite(s.chats) ? s.chats : 0,
    chatIds: s.chatIds && typeof s.chatIds === 'object' ? s.chatIds : {},
  };
}

/**
 * Messages hub data (`inbox`): threads I joined, my posts, 回应 events, chats. Polls every 15 s while the app is active
 * (this also drives the mock's simulated users). Seen marks persist per `Session.accountKey` at `liuda-inbox-seen-v1`.
 */
export function InboxProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const token = session?.token ?? null;
  // Seen marks belong to one account (opaque `accountKey`), not to a login method: a new guest starts unseen.
  const account = session?.accountKey ?? '';
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [seenDoc, setSeenDoc] = useState<SeenDoc>({});
  const [seenLoaded, setSeenLoaded] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const latest = useRef({ token });
  useEffect(() => { latest.current = { token }; });
  const seq = useRef(0);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(INBOX_SEEN_KEY).then(raw => {
      const parsed = raw ? JSON.parse(raw) as unknown : null;
      if (active && parsed && typeof parsed === 'object') setSeenDoc(parsed as SeenDoc);
    }).catch(() => undefined).finally(() => { if (active) setSeenLoaded(true); });
    const sub = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => { active = false; sub.remove(); };
  }, []);

  useEffect(() => {
    if (seenLoaded) AsyncStorage.setItem(INBOX_SEEN_KEY, JSON.stringify(seenDoc)).catch(() => undefined);
  }, [seenLoaded, seenDoc]);

  const refresh = useCallback(async () => {
    if (!latest.current.token) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const res = await retryOnNetwork(() => api.inbox({}));
      if (n !== seq.current) return;
      setInbox(res);
      setError(null);
    } catch (e) {
      if (n === seq.current) setError(toApiError(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);

  const [shownToken, setShownToken] = useState(token);
  if (shownToken !== token) { setShownToken(token); setInbox(null); setError(null); }
  useEffect(() => {
    if (!token || !appActive) return;
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, POLL_MS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [token, appActive, refresh]);
  useBus(['inbox', 'chats', 'posts'], () => { refresh(); });

  const seen = readSeen(seenDoc, account);
  const updateSeen = useCallback((fn: (s: Seen) => Seen) => {
    if (!account) return;
    setSeenDoc(doc => ({ ...doc, [account]: fn(readSeen(doc, account)) }));
  }, [account]);

  const markSeen = useCallback((kind: 'replies' | 'chats') => {
    const nowTs = Date.now();
    updateSeen(s => {
      if (kind === 'replies') {
        const newest = Math.max(0, ...(inbox?.events ?? []).map(e => e.createdAt));
        return { ...s, replies: Math.max(s.replies, nowTs, newest) };
      }
      const newest = Math.max(0, ...(inbox?.chats ?? []).map(chatActivity));
      return { ...s, chats: Math.max(s.chats, nowTs, newest), chatIds: {} };
    });
  }, [inbox, updateSeen]);

  const markChatSeen = useCallback((chatId: string, at: number) => {
    updateSeen(s => (s.chatIds[chatId] ?? 0) >= at ? s : { ...s, chatIds: { ...s.chatIds, [chatId]: at } });
  }, [updateSeen]);

  const unseen = useMemo(() => {
    if (!inbox) return { replies: 0, chats: 0 };
    const replies = inbox.events.filter(e => e.createdAt > seen.replies).length;
    const chats = inbox.chats.filter(c => c.state !== 'destroyed' && chatActivity(c) > Math.max(seen.chats, seen.chatIds[c.id] ?? 0)).length;
    return { replies, chats };
  }, [inbox, seen.replies, seen.chats, seen.chatIds]);

  const value = useMemo(() => ({ inbox, loading, error, refresh, unseen, markSeen }), [inbox, loading, error, refresh, unseen, markSeen]);
  return <SeenContext.Provider value={markChatSeen}><InboxContext.Provider value={value}>{children}</InboxContext.Provider></SeenContext.Provider>;
}

/**
 * `{ inbox, loading, error, refresh, unseen: { replies, chats }, markSeen(kind) }`. `unseen.replies` counts 回应 events
 * newer than the last `markSeen('replies')`; `unseen.chats` counts chats with activity since last seen (per chat via useChat).
 */
export function useInbox(): InboxStore {
  const value = useContext(InboxContext);
  if (!value) throw new Error('InboxProvider is required');
  return value;
}

/** Internal: lets `useChat` mark a single chat seen up to a timestamp. */
export function useInboxSeen(): (chatId: string, at: number) => void {
  const value = useContext(SeenContext);
  if (!value) throw new Error('InboxProvider is required');
  return value;
}
