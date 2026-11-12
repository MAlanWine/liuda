import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, describeError, type PostSummary, type ThreadMeta } from '../../api';
import { formatRelative } from '../../domain/time';
import { useSession } from '../../state/session';
import { useInbox } from '../../state/inbox';
import { usePosition, stampPosition } from '../../state/position';
import { useBus } from '../../state/bus';
import { Segmented } from '../../components/common/Segmented';
import { Notice } from '../../components/common/Notice';
import { DemoBadge } from '../../components/common/DemoBadge';
import { PermissionHelp } from '../../components/common/PermissionHelp';
import { Action, colors, ui } from '../../components/ui';

type RecordView = 'owned' | 'joined' | 'saved';
const sections: Record<RecordView, { tab: string; empty: string; hint: string }> = {
  owned: { tab: '我留下的', empty: '还没有留下自己的声音', hint: '到一个具体地点，留下一句自己的话。' },
  joined: { tab: '我参与的', empty: '还没有参与的对话', hint: '在现场留下一句话，或接别人一句，离开后也能继续。' },
  saved: { tab: '想去的地方', empty: '还没有想去的地方', hint: '在发现页点书签，为下次出门留点期待。' },
};
const OPTIONS = (Object.keys(sections) as RecordView[]).map(value => ({ value, label: sections[value].tab }));
const isView = (v: unknown): v is RecordView => v === 'owned' || v === 'joined' || v === 'saved';

/** Bookmarked posts; sends the current position only when it is fresh, so tiers are right without forcing GPS. */
function useSaved(token: string | null) {
  const { fix, fresh } = usePosition();
  const position = useRef<{ fix: typeof fix; fresh: boolean }>({ fix, fresh });
  useEffect(() => { position.current = { fix, fresh }; }, [fix, fresh]);
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    if (!token) { setPosts(null); return; }
    setLoading(true);
    const { fix: current, fresh: isFresh } = position.current;
    try {
      const res = await api.bookmarks(current && isFresh ? { position: stampPosition(current) } : {});
      if (mine === seq.current) { setPosts(res.posts); setError(''); }
    } catch (cause) {
      if (mine === seq.current) setError(describeError(cause));
    } finally { if (mine === seq.current) setLoading(false); }
  }, [token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useBus(['posts', 'session', 'demo'], () => { load(); });
  return { posts, error, loading, load };
}

export default function ActivityScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const view: RecordView = isView(params.view) ? params.view : 'owned';
  const meta = sections[view];
  const { session } = useSession();
  const inbox = useInbox();
  const { refresh: refreshInbox } = inbox;
  const saved = useSaved(session?.token ?? null);
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(useCallback(() => { setNow(Date.now()); refreshInbox(); }, [refreshInbox]));

  function back() { if (router.canGoBack()) router.back(); else router.replace('/me'); }
  function discover() { router.dismissTo('/discover'); }
  function open(id: string) { router.push({ pathname: '/place/[id]', params: { id } }); }

  const threads: ThreadMeta[] | null = !inbox.inbox ? null : view === 'owned' ? inbox.inbox.mine : inbox.inbox.threads;
  const loading = view === 'saved' ? saved.loading && !saved.posts : inbox.loading && !inbox.inbox;
  const error = view === 'saved' ? saved.error : inbox.error ? describeError(inbox.error) : '';
  const count = view === 'saved' ? saved.posts?.length ?? 0 : threads?.length ?? 0;
  const refreshing = view === 'saved' ? saved.loading && !!saved.posts : inbox.loading && !!inbox.inbox;
  function refresh() { setNow(Date.now()); if (view === 'saved') saved.load(); else refreshInbox(); }

  return <ScrollView style={ui.screen} contentContainerStyle={ui.content}
    refreshControl={session ? <RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={refresh} /> : undefined}>
    <Segmented options={OPTIONS} value={view} onChange={next => router.setParams({ view: next })} accessibilityLabel="我的记录" />
    <View style={s.header}>
      <Text style={ui.muted}>仅自己可见</Text>
      <DemoBadge label="本机演示数据" />
    </View>
    {!session ? <View style={ui.panel}>
      <Text style={ui.body}>登录后才能看到自己的记录</Text>
      <Text style={ui.muted}>退出登录后，记录仍保存在本机的演示账号里。</Text>
      <Action title="登录" onPress={() => router.push('/login')} />
    </View> : loading ? <View style={s.loading}><ActivityIndicator color={colors.accent} /></View>
      : <>
        {view === 'saved' ? <PermissionHelp showSimulated /> : null}
        <Notice tone="error" message={error} actionLabel="重试" onAction={refresh} />
        {count === 0 && !error ? <View style={ui.panel}>
          <Text style={ui.body}>{meta.empty}</Text><Text style={ui.muted}>{meta.hint}</Text>
          <Action secondary title="去发现" onPress={discover} />
        </View> : null}
        {view === 'saved'
          ? saved.posts?.map(post => <Pressable key={post.id} accessibilityRole="button" accessibilityLabel={`${post.name}，${post.distanceLabel}`} onPress={() => open(post.id)} style={({ pressed }) => [ui.panel, pressed && ui.pressed]}>
            <View style={s.header}><Text style={[ui.muted, s.flex]}>{[post.distanceLabel, formatRelative(post.createdAt, now)].filter(Boolean).join(' · ')}</Text><Ionicons name="arrow-forward" size={17} color={colors.muted} /></View>
            <Text style={s.placeName}>{post.name}</Text>
            <Text numberOfLines={3} style={s.text}>{post.level === 'full' ? post.text : post.displayText}</Text>
            {post.level !== 'full' ? <Text style={ui.muted}>走近一些才能看到全文</Text> : null}
          </Pressable>)
          : threads?.map(thread => <Pressable key={thread.id} accessibilityRole="button" accessibilityLabel={`${thread.name}，${thread.commentCount} 句接话`} onPress={() => open(thread.id)} style={({ pressed }) => [ui.panel, pressed && ui.pressed]}>
            <View style={s.header}><Text style={[s.placeName, s.flex]} numberOfLines={2}>{thread.name}</Text><Ionicons name="arrow-forward" size={17} color={colors.muted} /></View>
            <Text style={ui.muted}>{`${thread.commentCount} 句接话 · ${formatRelative(thread.updatedAt, now)}更新`}</Text>
          </Pressable>)}
      </>}
    <Action secondary title="回到个人中心" onPress={back} />
    <Text style={ui.muted}>这些记录保存在这台手机的模拟后端，只有你自己看得到。</Text>
  </ScrollView>;
}
const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  flex: { flex: 1 },
  loading: { paddingVertical: 32, alignItems: 'center' },
  placeName: { color: colors.text, fontSize: 19, lineHeight: 28, fontWeight: '500' },
  text: { color: colors.text, fontSize: 15, lineHeight: 25 },
});
