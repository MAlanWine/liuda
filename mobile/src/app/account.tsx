import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, describeError, type AuthMethod } from '../api';
import { formatRelative } from '../domain/time';
import { useSession } from '../state/session';
import { useBus } from '../state/bus';
import { AccountGroup, AccountRow, AUTH_METHOD_ORDER, AUTH_METHODS } from '../components/account/AccountRow';
import { SignInSheet } from '../components/account/SignInSheet';
import { DemoBadge } from '../components/common/DemoBadge';
import { Notice } from '../components/common/Notice';
import { Action, colors, ui } from '../components/ui';

type DemoAccount = { method: AuthMethod; label: string; current: boolean };
const DEMO_INVITE_HINT = 'LIUDA-DEMO';

/** Mock accounts on this phone (`demoAccounts`); falls back to the three methods when signed out or offline. */
function useDemoAccounts(token: string | null) {
  const [accounts, setAccounts] = useState<DemoAccount[] | null>(null);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    if (!token) { setAccounts(null); return; }
    try {
      const res = await api.demoAccounts({});
      if (mine === seq.current) setAccounts(res.accounts);
    } catch { if (mine === seq.current) setAccounts(null); }
  }, [token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useBus(['session'], () => { load(); });
  return accounts;
}

export default function AccountScreen() {
  const { ready, session, member, notice, signOut, refreshStatus } = useSession();
  const accounts = useDemoAccounts(session?.token ?? null);
  const [method, setMethod] = useState<AuthMethod | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'out' | 'join' | null>(null);
  const [code, setCode] = useState('');
  const [now] = useState(() => Date.now());

  // 当前 follows the local session at once (the demoAccounts reload can lag behind a switch under simulated latency).
  const rows: DemoAccount[] = (accounts ?? AUTH_METHOD_ORDER.map(m => ({ method: m, label: AUTH_METHODS[m].name, current: false })))
    .map(row => ({ ...row, current: session?.method === row.method }));

  function confirmSignOut() {
    Alert.alert('退出登录？', '退出后需要重新登录才能继续使用。你的记录仍保存在这台手机的演示账号里。', [
      { text: '取消', style: 'cancel' },
      { text: '退出登录', style: 'destructive', onPress: async () => {
        setBusy('out'); setError(''); setMessage('');
        try { await signOut(); setMessage('已退出登录。可以在下方重新登录。'); }
        catch (cause) { setError(describeError(cause)); }
        finally { setBusy(null); }
      } },
    ]);
  }
  async function join() {
    if (busy || !session) return;
    setBusy('join'); setError(''); setMessage('');
    try {
      await api.join({ inviteCode: code.trim().toUpperCase() });
      await refreshStatus();
      setMessage('已加入试用（演示）。'); setCode('');
    } catch (cause) { setError(describeError(cause)); }
    finally { setBusy(null); }
  }

  return <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
    <AccountGroup title="当前账号" aside={<DemoBadge label="演示账号" />}>
      {session
        ? <AccountRow icon={AUTH_METHODS[session.method].icon} title={session.accountLabel}
          subtitle={`${formatRelative(session.createdAt, Math.max(now, session.createdAt))}登录 · 只存在这台手机`} />
        : <AccountRow icon="log-out-outline" title={ready ? '未登录' : '正在准备演示账号…'} subtitle="登录后才能看附近、留话和继续对话" />}
    </AccountGroup>
    <Notice message={notice} />
    <Notice message={message} />
    <Notice tone="error" message={error} />

    <AccountGroup title={session ? '切换账号' : '登录'}>
      {rows.map((row, index) => <AccountRow key={row.method} divider={index > 0} icon={AUTH_METHODS[row.method].icon}
        title={row.label} value={row.current ? '当前' : undefined} chevron={!row.current}
        accessibilityLabel={row.current ? `${row.label}，当前账号` : `${session ? '切换到' : '登录'}${row.label}`}
        onPress={row.current ? undefined : () => { setError(''); setMessage(''); setMethod(row.method); }} />)}
    </AccountGroup>
    <Text style={ui.muted}>切换账号就像换了一台手机：比如先用微信账号留话，再切到 Apple 账号去看、去接话。首次从游客切到微信或 Apple 时，游客的记录会并入这个账号。演示登录不会连接微信或 Apple。</Text>

    {session && !member ? <View style={ui.panel}>
      <Text style={ui.body}>加入试用</Text>
      <Text style={ui.muted}>这个账号还没有加入试用，输入邀请码后才能留话和接话。演示邀请码：{DEMO_INVITE_HINT}</Text>
      <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="邀请码" placeholderTextColor={colors.muted}
        accessibilityLabel="邀请码" style={[ui.input, s.input]} returnKeyType="done" onSubmitEditing={join} editable={busy !== 'join'} />
      <Action title={busy === 'join' ? '正在加入…' : '加入试用'} disabled={!code.trim() || busy !== null} onPress={join} />
    </View> : null}

    {session ? <Action secondary title={busy === 'out' ? '正在退出…' : '退出登录'} disabled={busy !== null} onPress={confirmSignOut} /> : null}

    <SignInSheet method={method} onClose={() => setMethod(null)} onSignedIn={m => { setMethod(null); setMessage(`已切换到${AUTH_METHODS[m].name}（演示账号）。`); }} />
  </ScrollView>;
}
const s = StyleSheet.create({
  input: { backgroundColor: colors.raised },
});
