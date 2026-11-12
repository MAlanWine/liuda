import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, describeError, isApiError } from '../api';
import { defaultProfile, normalizeProfile, type Profile } from './profile-data';
import { useSession } from './session';

type ProfileStore = {
  profile: Profile;
  ready: boolean;
  notice: string;
  save: (input: { nickname: string; avatar: string | null }) => Promise<void>;
};
const ProfileContext = createContext<ProfileStore | null>(null);

/** The signed-in account's own profile, read from and written to the API (`me` / `updateProfile`). */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { ready: sessionReady, session } = useSession();
  const token = session?.token ?? null;
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!sessionReady) return;
    if (!token) return;
    let active = true;
    api.me({}).then(({ profile: remote }) => {
      if (!active) return;
      try { setProfile(normalizeProfile(remote)); setNotice(''); }
      catch { setProfile({ ...defaultProfile }); setNotice('资料未能读取，当前使用默认身份。你可以重新编辑并保存。'); }
    }).catch(() => {
      if (active) setNotice('资料未能读取，当前使用默认身份。你可以重新编辑并保存。');
    }).finally(() => { if (active) setLoadedFor(token); });
    return () => { active = false; };
  }, [sessionReady, token]);

  const save = useCallback(async (input: { nickname: string; avatar: string | null }) => {
    const next = normalizeProfile(input);
    const send = () => api.updateProfile({ nickname: next.nickname, avatar: next.avatar });
    try {
      try { await send(); }
      catch (error) {
        if (isApiError(error) && error.code === 'NETWORK') await send();
        else throw error;
      }
    } catch (error) {
      const reason = isApiError(error) && (error.code === 'INVALID_INPUT' || error.code === 'CONTENT_REJECTED') ? describeError(error) : '资料未保存成功，请稍后重试。';
      throw new Error(`${reason}你的修改仍保留在此页。`);
    }
    setProfile(next);
    setNotice('');
  }, []);

  // Signed out: the default identity, nothing to load.
  const ready = sessionReady && (!token || loadedFor === token);
  const shown = token ? profile : defaultProfile;
  const value = useMemo(() => ({ profile: shown, ready, notice, save }), [shown, ready, notice, save]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

/** `{ profile, ready, notice, save(input) }` — same shape as before; `save` throws a Chinese `Error` on failure. */
export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('ProfileProvider is required');
  return value;
}
