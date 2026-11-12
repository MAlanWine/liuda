import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { describeError, type AuthMethod } from '../../api';
import { useSession } from '../../state/session';
import { Sheet } from '../common/Sheet';
import { Notice } from '../common/Notice';
import { DemoBadge } from '../common/DemoBadge';
import { Action, colors } from '../ui';
import { AUTH_METHODS } from './AccountRow';

const BODY: Record<AuthMethod, string> = {
  wechat: '这是演示登录，不会连接微信，也不会读取你的微信资料。账号只存在这台手机的模拟后端里。',
  apple: '这是演示登录，不会连接 Apple，也不会读取你的 Apple ID。账号只存在这台手机的模拟后端里。',
  guest: '以本机游客身份继续。记录保存在这台手机的模拟后端里，不需要任何账号。',
};

/**
 * Mock sign-in sheet (演示登录：不会连接微信或 Apple). Visible while `method` is set; 登录 calls `useSession().signIn(method)`,
 * then `onSignedIn(method)`. Errors stay in the sheet (Chinese via `describeError`).
 */
export function SignInSheet({ method, onClose, onSignedIn }: {
  method: AuthMethod | null; onClose: () => void; onSignedIn?: (method: AuthMethod) => void;
}) {
  const { session, signIn } = useSession();
  const [shown, setShown] = useState<AuthMethod>(method ?? 'wechat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Keep the last method while the sheet animates out; reset the error each time it opens (state adjusted during render).
  const [openFor, setOpenFor] = useState<AuthMethod | null>(method);
  if (method !== openFor) {
    setOpenFor(method);
    if (method) { setShown(method); setError(''); }
  }

  const meta = AUTH_METHODS[shown];
  const current = session?.method === shown;
  async function submit() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await signIn(shown);
      if (mounted.current) onSignedIn?.(shown);
    } catch (cause) {
      if (mounted.current) setError(describeError(cause));
    } finally { if (mounted.current) setBusy(false); }
  }
  return <Sheet visible={method !== null} onClose={busy ? () => undefined : onClose} title={`${meta.name}登录`}>
    <View style={s.head}>
      <View style={s.icon}><Ionicons name={meta.icon} size={22} color={colors.text} /></View>
      <DemoBadge label="演示登录" />
    </View>
    <Text style={s.lead}>演示登录：不会连接微信或 Apple</Text>
    <Text style={s.body}>{BODY[shown]}</Text>
    {current ? <Text style={s.body}>你现在用的就是这个账号。</Text> : null}
    <Notice tone="error" message={error} />
    {busy ? <View style={s.busy} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.accent} /><Text style={s.body}>处理中…正在切换账号</Text></View> : null}
    <Action title={busy ? '正在登录…' : current ? '继续使用' : `以${meta.name}演示账号登录`} disabled={busy} onPress={submit} />
  </Sheet>;
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  lead: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
