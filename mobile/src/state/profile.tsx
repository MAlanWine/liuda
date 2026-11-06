import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { decodeProfile, defaultProfile, normalizeProfile, type Profile } from './profile-data';

type ProfileStore = {
  profile: Profile;
  ready: boolean;
  notice: string;
  save: (input: { nickname: string; avatar: string | null }) => Promise<void>;
};
const ProfileContext = createContext<ProfileStore | null>(null);
const key = 'liuda-local-profile-v1';
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key).then(raw => {
      const decoded = decodeProfile(raw);
      if (active) setProfile(decoded);
    }).catch(() => {
      if (active) setNotice('资料未能读取，当前使用默认身份。你可以重新编辑并保存。');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  async function save(input: { nickname: string; avatar: string | null }) {
    const next = normalizeProfile(input);
    try { await AsyncStorage.setItem(key, JSON.stringify(next)); }
    catch { throw new Error('资料未保存成功，请稍后重试。你的修改仍保留在此页。'); }
    setProfile(next);
    setNotice('');
  }
  return <ProfileContext.Provider value={{ profile, ready, notice, save }}>{children}</ProfileContext.Provider>;
}
export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('ProfileProvider is required');
  return value;
}
