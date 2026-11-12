import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, describeError } from '../api';
import { useProfile } from '../state/profile';
import { useSession } from '../state/session';
import { useInbox } from '../state/inbox';
import { useBus } from '../state/bus';
import { Avatar } from '../components/Avatar';
import { AccountGroup, AccountRow, AUTH_METHODS } from '../components/account/AccountRow';
import { DemoBadge } from '../components/common/DemoBadge';
import { Notice } from '../components/common/Notice';
import { Action, colors, Loading, Screen } from '../components/ui';

/** Number of my bookmarks (想去的地方), refetched on focus (and when the token changes) and on posts / session / demo events. */
function useSavedCount(token: string | null): number | null {
  const [count, setCount] = useState<number | null>(null);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    if (!token) { setCount(null); return; }
    try {
      const res = await api.bookmarks({});
      if (mine === seq.current) setCount(res.posts.length);
    } catch { /* keep the last count; the list screen shows the error */ }
  }, [token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useBus(['posts', 'session', 'demo'], () => { load(); });
  return count;
}

export default function MeScreen() {
  const { profile, ready, notice } = useProfile();
  const { ready: sessionReady, session } = useSession();
  const { inbox, error, refresh } = useInbox();
  const saved = useSavedCount(session?.token ?? null);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  if (!ready || !sessionReady) return <Loading />;

  const signedIn = !!session;
  const show = (n: number | null | undefined) => signedIn && n !== null && n !== undefined ? String(n) : '–';
  const items = [
    { key: 'owned', icon: 'create-outline' as const, title: '我留下的', description: '在某个地方，留下的声音', count: inbox?.mine.length },
    // 我参与的 = my posts + threads I joined on site, the same list as 消息 › 我参与的 (docs/thread-continuation.md).
    { key: 'joined', icon: 'chatbubble-ellipses-outline' as const, title: '我参与的', description: '离开现场，也能接着聊', count: inbox?.threads.length },
    { key: 'saved', icon: 'bookmark-outline' as const, title: '想去的地方', description: '给下一次出门留点期待', count: saved },
  ];
  function back() { if (router.canGoBack()) router.back(); else router.replace('/discover'); }

  return <Screen><ScrollView contentContainerStyle={s.content}>
    <View style={s.heading}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={back} style={s.back}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" style={s.pageTitle}>我</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`编辑我的资料，${profile.nickname}`} onPress={() => router.push('/profile/edit')} style={({ pressed }) => [s.identity, pressed && s.pressed]}>
      <Avatar uri={profile.avatar} size={74} />
      <View style={s.identityText}>
        <Text numberOfLines={2} style={s.nickname}>{profile.nickname}</Text>
        <Text style={s.muted}>{signedIn ? '编辑头像与昵称 · 只有你自己看得到' : '登录后可编辑头像与昵称'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.inactive} />
    </Pressable>
    <Notice message={notice} />

    {!signedIn ? <View style={s.signedOut}>
      <Text style={s.signedOutTitle}>你已退出登录</Text>
      <Text style={s.muted}>重新登录演示账号后，才能看到自己的记录、继续对话。</Text>
      <Action title="登录" onPress={() => router.push('/login')} />
    </View> : null}

    <AccountGroup title="我的记录" aside={<View style={s.private}><Ionicons name="lock-closed-outline" size={11} color={colors.muted} /><Text style={s.privateText}>仅自己可见</Text></View>}>
      {items.map((item, index) => <AccountRow key={item.key} divider={index > 0} icon={item.icon} title={item.title} subtitle={item.description}
        value={show(item.count)} disabled={!signedIn} accessibilityLabel={`${item.title}，${show(item.count)} 条`}
        onPress={() => router.push({ pathname: '/profile/activity', params: { view: item.key } })} />)}
    </AccountGroup>
    {signedIn && error ? <Notice tone="error" message={describeError(error)} actionLabel="重试" onAction={() => { refresh(); }} /> : null}

    <AccountGroup title="设置">
      <AccountRow icon={session ? AUTH_METHODS[session.method].icon : 'log-in-outline'} title="账号与登录"
        subtitle={session ? session.accountLabel : '未登录'} onPress={() => router.push('/account')} />
      <AccountRow divider icon="flask-outline" title="演示与模拟" badge={<DemoBadge />} subtitle="位置模式、模拟用户、重置演示数据" onPress={() => router.push('/settings/demo')} />
      <AccountRow divider icon="ban-outline" title="已屏蔽" subtitle="屏蔽过的人，可以在这里解除" disabled={!signedIn} onPress={() => router.push('/settings/blocked')} />
      <AccountRow divider icon="shield-checkmark-outline" title="匿名与数据" onPress={() => router.push('/about-privacy')} />
    </AccountGroup>
    <Text style={s.footer}>本机演示 · 数据保存在这台手机的模拟后端，暂不支持跨设备恢复</Text>
  </ScrollView></Screen>;
}
const s = StyleSheet.create({
  content: { padding: 24, paddingTop: 26, paddingBottom: 40, gap: 24 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  pageTitle: { color: colors.text, fontSize: 26, fontWeight: '500' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingBottom: 6 },
  identityText: { flex: 1, gap: 7 },
  nickname: { color: colors.text, fontSize: 23, fontWeight: '500', lineHeight: 32 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  pressed: { opacity: 0.7 },
  signedOut: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, gap: 10 },
  signedOutTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  private: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  privateText: { color: colors.muted, fontSize: 11 },
  footer: { color: colors.muted, fontSize: 11, lineHeight: 20, textAlign: 'center' },
});
