import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const key = 'liuda-welcome-v1';
const EntryContext = createContext({ ready: false, started: false, notice: '', begin: () => {} });
export function EntryProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key).then(value => { if (active) setStarted(current => current || value === 'started'); })
      .catch(() => { if (active) setNotice('欢迎页偏好暂时无法读取，你仍可以继续浏览。'); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  function begin() {
    setStarted(true);
    AsyncStorage.setItem(key, 'started').catch(() => setNotice('欢迎页偏好未保存，下次可能再次显示。'));
  }
  return <EntryContext.Provider value={{ ready, started, notice, begin }}>{children}</EntryContext.Provider>;
}
export const useEntry = () => useContext(EntryContext);
