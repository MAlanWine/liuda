import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, backendNotice, describeError, isApiError, setSessionToken, type AuthMethod, type PublicProfile, type Session } from '../api';
import { emit } from './bus';
import { decodeProfile } from './profile-data';

export const SESSION_KEY = 'liuda-session-v1';
const LEGACY_PROFILE_KEY = 'liuda-local-profile-v1';

type SessionStore = {
  ready: boolean; session: Session | null; member: boolean; notice: string;
  signIn(method: AuthMethod): Promise<void>; signOut(): Promise<void>;
  /** Re-reads `api.status` (e.g. after `join`) and updates `member`. Throws `ApiError`. */
  refreshStatus(): Promise<void>;
};
const SessionContext = createContext<SessionStore | null>(null);

function isSession(value: unknown): value is Session {
  const s = value as Session | null;
  return !!s && typeof s === 'object' && typeof s.token === 'string' && !!s.token
    && (s.method === 'guest' || s.method === 'wechat' || s.method === 'apple') && typeof s.accountLabel === 'string';
}

async function retryNetwork<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (error) {
    if (isApiError(error) && error.code === 'NETWORK') return fn();
    throw error;
  }
}

/** Old on-device profile (`liuda-local-profile-v1`, read-only) used to seed the first guest account. */
async function legacyProfile(): Promise<PublicProfile | undefined> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_PROFILE_KEY);
    if (raw === null) return undefined;
    const { nickname, avatar } = decodeProfile(raw);
    return { nickname, avatar };
  } catch {
    return undefined;
  }
}

/**
 * Mock session (`liuda-session-v1`). On first launch signs in as the device guest account, migrating the old
 * local profile via `signIn({ method: 'guest', profile })`. Sets the API token; emits `session` on every change.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState(false);
  const [notice, setNotice] = useState('');
  const busy = useRef<Promise<void> | null>(null);

  const adopt = useCallback(async (next: Session) => {
    setSessionToken(next.token);
    let isMember = true;
    try { isMember = (await api.status({})).member; } catch { /* keep default; stores surface their own errors */ }
    try { await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next)); }
    catch { setNotice('登录状态未能保存，下次打开可能需要重新登录（演示账号）。'); }
    setSession(next);
    setMember(isMember);
    emit('session', 'posts', 'inbox', 'chats');
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      let stored: Session | null = null;
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        const parsed = raw ? JSON.parse(raw) as unknown : null;
        stored = isSession(parsed) ? parsed : null;
      } catch { stored = null; }
      try {
        if (stored) {
          setSessionToken(stored.token);
          try {
            const status = await retryNetwork(() => api.status({}));
            if (!active) return;
            // Sessions saved before `accountKey` existed get it from status (additive field).
            const restored = stored.accountKey ? stored : { ...stored, accountKey: status.accountKey };
            if (restored !== stored) AsyncStorage.setItem(SESSION_KEY, JSON.stringify(restored)).catch(() => undefined);
            setSession(restored);
            setMember(status.member);
            emit('session');
            return;
          } catch (error) {
            if (!isApiError(error) || error.code !== 'AUTH_REQUIRED') {
              if (!active) return;
              setSession(stored);
              setNotice(describeError(error));
              return;
            }
            setSessionToken(null);
          }
        }
        const profile = await legacyProfile();
        const next = await retryNetwork(() => api.signIn({ method: 'guest', ...profile ? { profile } : {} }));
        if (active) await adopt(next);
      } catch (error) {
        if (active) setNotice(`演示账号暂时无法登录：${describeError(error)}`);
      } finally {
        if (active) {
          const extra = backendNotice();
          if (extra) setNotice(current => current || extra);
          setReady(true);
        }
      }
    })();
    return () => { active = false; };
  }, [adopt]);

  const signIn = useCallback(async (method: AuthMethod) => {
    while (busy.current) await busy.current.catch(() => undefined);
    const run = (async () => {
      const next = await retryNetwork(() => api.signIn({ method }));
      await adopt(next);
      setNotice('');
    })();
    busy.current = run;
    try { await run; } finally { busy.current = null; }
  }, [adopt]);

  const signOut = useCallback(async () => {
    try { await api.signOut({}); } catch { /* signing out locally is enough for the mock */ }
    setSessionToken(null);
    try { await AsyncStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    setSession(null);
    setMember(false);
    emit('session', 'posts', 'inbox', 'chats');
  }, []);

  const refreshStatus = useCallback(async () => {
    const status = await retryNetwork(() => api.status({}));
    setMember(status.member);
  }, []);

  const value = useMemo(() => ({ ready, session, member, notice, signIn, signOut, refreshStatus }),
    [ready, session, member, notice, signIn, signOut, refreshStatus]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * `{ ready, session, member, notice, signIn(method), signOut(), refreshStatus() }`. `ready` = first-launch sign-in attempt finished.
 * `signIn` throws `ApiError` on failure. After `signOut`, `session` is null and the other stores pause until a new sign-in.
 */
export function useSession(): SessionStore {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is required');
  return value;
}
