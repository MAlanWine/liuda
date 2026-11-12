import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, ApiError, describeError, type DemoSettings } from '../../api';
import { useSession } from '../../state/session';
import { usePosition, type PositionMode } from '../../state/position';
import { emit } from '../../state/bus';
import { retryOnNetwork } from '../../state/actions';
import { AccountGroup, AccountRow } from '../../components/account/AccountRow';
import { DemoBadge } from '../../components/common/DemoBadge';
import { Notice } from '../../components/common/Notice';
import { PermissionHelp } from '../../components/common/PermissionHelp';
import { Segmented } from '../../components/common/Segmented';
import { Action, colors, ui } from '../../components/ui';

type LatencyKey = 'none' | 'default' | 'slow';
const LATENCY: Record<LatencyKey, { label: string; range: [number, number] }> = {
  none: { label: '无延迟', range: [0, 0] },
  default: { label: '默认', range: [120, 450] },
  slow: { label: '较慢', range: [800, 2000] },
};
const LATENCY_OPTIONS = (Object.keys(LATENCY) as LatencyKey[]).map(value => ({ value, label: LATENCY[value].label }));
const MODE_OPTIONS: { value: PositionMode; label: string }[] = [{ value: 'gps', label: '真实定位' }, { value: 'simulated', label: '模拟位置' }];
const ANCHOR_TEXT = { fix: '演示地点围绕首次定位的位置生成。', simulated: '演示地点围绕模拟起点生成。' } as const;

function latencyKey(range: [number, number]): LatencyKey | null {
  const hit = (Object.keys(LATENCY) as LatencyKey[]).find(k => LATENCY[k].range[0] === range[0] && LATENCY[k].range[1] === range[1]);
  return hit ?? null;
}

type Busy = 'anchor' | 'settings' | 'credits' | 'reset' | null;

export default function DemoSettingsScreen() {
  const { session } = useSession();
  const token = session?.token ?? null;
  const { mode, setMode, fix, fresh, refresh: readPosition } = usePosition();
  const [settings, setSettings] = useState<DemoSettings | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    if (!token) { setSettings(null); setCredits(null); return; }
    try {
      const [next, ent] = await Promise.all([api.demoSettings({}), api.entitlements({})]);
      if (mine === seq.current) { setSettings(next); setCredits(ent.chatCredits); }
    } catch (cause) { if (mine === seq.current) setError(describeError(cause)); }
  }, [token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function run(kind: Exclude<Busy, null>, task: () => Promise<string>) {
    if (busy) return;
    setBusy(kind); setError(''); setMessage('');
    try { setMessage(await task()); }
    catch (cause) { setError(describeError(cause)); }
    finally { setBusy(null); }
  }
  function update(patch: Partial<Pick<DemoSettings, 'latencyMs' | 'flakyWrites' | 'simulatedUsers'>>, done: string) {
    run('settings', async () => {
      setSettings(await retryOnNetwork(() => api.demoUpdateSettings(patch)));
      return done;
    });
  }
  function reanchor() {
    run('anchor', async () => {
      const here = mode === 'gps' && !(fix && fresh) ? await readPosition() : fix;
      if (!here) throw new ApiError('LOCATION_REQUIRED', mode === 'gps' ? '还没有拿到真实定位，可以先打开定位权限，或改用模拟位置。' : '还没有模拟位置。');
      setSettings(await retryOnNetwork(() => api.demoReanchor({ center: { latitude: here.latitude, longitude: here.longitude } })));
      emit('demo', 'posts');
      return '演示地点已移到你附近（模拟数据）。';
    });
  }
  function grant() {
    run('credits', async () => {
      const res = await retryOnNetwork(() => api.demoGrantCredits({}));
      setCredits(res.chatCredits);
      emit('chats');
      return `已领取演示权益，现在可申请 ${res.chatCredits} 次私聊。`;
    });
  }
  function confirmReset() {
    Alert.alert('重置演示数据？', '会清空这台手机上所有留话、接话、私聊、收藏和屏蔽，并重新生成演示地点。账号和这里的设置会保留。此操作不能撤销。', [
      { text: '取消', style: 'cancel' },
      { text: '重置', style: 'destructive', onPress: () => run('reset', async () => {
        await retryOnNetwork(() => api.demoReset({}));
        emit('demo', 'posts', 'inbox', 'chats');
        await load();
        return '演示数据已重置。';
      }) },
    ]);
  }

  const latency = settings ? latencyKey(settings.latencyMs) : null;
  const signedIn = !!session;
  return <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
    <View style={s.intro}>
      <DemoBadge label="演示 · 模拟" />
      <Text style={ui.muted}>这些开关只影响这台手机上的模拟后端，用来试效果；正式服务不会有这一页。</Text>
    </View>
    <Notice message={message} />
    <Notice tone="error" message={error} />

    <AccountGroup title="位置">
      <View style={s.block}>
        <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} accessibilityLabel="位置模式" />
        <Text style={ui.muted}>{mode === 'simulated' ? '模拟位置：不使用 GPS，可在地点页用「模拟走近 / 模拟到场」移动。' : '真实定位：使用手机 GPS，到场判断需要精度 30 米以内。'}</Text>
        <PermissionHelp showSimulated />
      </View>
      <AccountRow divider icon="locate-outline" title="把演示地点移到我附近" subtitle={settings?.anchorSource ? ANCHOR_TEXT[settings.anchorSource] : '演示地点会在第一次查看附近时生成。'}
        disabled={!signedIn || busy !== null} chevron={false} value={busy === 'anchor' ? '正在移动…' : undefined} onPress={reanchor} />
    </AccountGroup>

    <AccountGroup title="模拟后端">
      <AccountRow icon="people-outline" title="模拟其他用户" badge={<DemoBadge label="模拟用户" />}
        subtitle="开启后，会有模拟用户回复你的留话、点赞，或发起私聊。" accessory={<Switch accessibilityLabel="模拟其他用户"
          value={settings?.simulatedUsers ?? false} disabled={!settings || busy !== null} trackColor={{ true: colors.accent, false: colors.line }}
          onValueChange={v => update({ simulatedUsers: v }, v ? '已开启模拟用户。' : '已关闭模拟用户，排队中的模拟动作已取消。')} />} />
      <View style={[s.block, s.divider]}>
        <Text style={s.label}>网络延迟（模拟）</Text>
        <Segmented options={LATENCY_OPTIONS} value={latency ?? 'default'} accessibilityLabel="网络延迟"
          onChange={k => { if (settings && !busy) update({ latencyMs: LATENCY[k].range }, `网络延迟已设为「${LATENCY[k].label}」。`); }} />
        <Text style={ui.muted}>{settings ? `每次请求等待 ${settings.latencyMs[0]}–${settings.latencyMs[1]} 毫秒。` : '登录后可调整。'}</Text>
      </View>
      <AccountRow divider icon="cloud-offline-outline" title="模拟写入失败"
        subtitle="约 5 次写入有 1 次先保存成功、再报网络错误，用来检验重试不会重复提交。" accessory={<Switch accessibilityLabel="模拟写入失败"
          value={settings?.flakyWrites ?? false} disabled={!settings || busy !== null} trackColor={{ true: colors.accent, false: colors.line }}
          onValueChange={v => update({ flakyWrites: v }, v ? '已开启模拟写入失败。' : '已关闭模拟写入失败。')} />} />
    </AccountGroup>

    <AccountGroup title="演示权益">
      <AccountRow icon="chatbubbles-outline" title="私聊次数" badge={<DemoBadge />} value={credits === null ? '–' : `${credits} 次`}
        subtitle="申请私聊被接受时扣 1 次。没有真实付费。" />
      <AccountRow divider icon="gift-outline" title={busy === 'credits' ? '正在领取…' : '领取演示权益（+3 次）'} chevron={false}
        disabled={!signedIn || busy !== null} onPress={grant} />
    </AccountGroup>

    <AccountGroup title="数据">
      <AccountRow icon="refresh-outline" tone="danger" title={busy === 'reset' ? '正在重置…' : '重置演示数据'} chevron={false}
        subtitle="清空本机所有演示内容并重新生成演示地点" disabled={!signedIn || busy !== null} onPress={confirmReset} />
    </AccountGroup>

    {!signedIn ? <View style={ui.panel}>
      <Text style={ui.body}>登录后才能调整模拟后端</Text>
      <Text style={ui.muted}>位置模式现在就可以切换；其余设置跟着演示账号保存在本机。</Text>
      <Action title="登录" onPress={() => router.push('/login')} />
    </View> : null}
  </ScrollView>;
}
const s = StyleSheet.create({
  intro: { gap: 10 },
  block: { gap: 12, paddingVertical: 16 },
  divider: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  label: { color: colors.text, fontSize: 15, lineHeight: 22 },
});
