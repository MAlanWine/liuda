import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { describeError, type ChatMeta, type InboxEvent, type ThreadMeta } from '../../api';
import { DemoBadge } from '../../components/common/DemoBadge';
import { Notice } from '../../components/common/Notice';
import { Segmented } from '../../components/common/Segmented';
import { ChatRow, chatClosed, confirmChatChange } from '../../components/messages/ChatRow';
import { EventRow } from '../../components/messages/EventRow';
import { ThreadRow } from '../../components/messages/ThreadRow';
import { Action, colors, Screen, ui } from '../../components/ui';
import { cancelChat, respondChat } from '../../state/actions';
import { useInbox } from '../../state/inbox';
import { useNow } from '../../state/now';
import { useSession } from '../../state/session';

type Tab = 'joined' | 'owned' | 'replies' | 'chats';
type Row = { key: string; kind: 'thread'; thread: ThreadMeta } | { key: string; kind: 'event'; event: InboxEvent } | { key: string; kind: 'chat'; chat: ChatMeta };

const TABS: readonly Tab[] = ['joined', 'owned', 'replies', 'chats'];
const isTab = (value: unknown): value is Tab => typeof value === 'string' && (TABS as readonly string[]).includes(value);
const SUBTITLE: Record<Tab, string> = {
  joined: '你留下的话和在现场接过的话，离开后也能继续。',
  owned: '你在各处留下的话，和它们收到的回复。',
  replies: '你留下或参与的对话里，最近有人接话。',
  chats: '现场申请、作者同意后开通的私聊。',
};
const EMPTY: Record<Tab, { title: string; hint: string; action?: { title: string; href: '/discover' | '/leave' } }> = {
  joined: { title: '还没有参与的对话', hint: '在现场留下一句话，或在别人的留话下接一句，离开后也能在这里继续。', action: { title: '去发现', href: '/discover' } },
  owned: { title: '还没有留下的话', hint: '在现场写下一句话，之后收到的回复都会在这里。', action: { title: '去留下一句', href: '/leave' } },
  replies: { title: '还没有新的回应', hint: '你留下或参与的对话有人接话时，会出现在这里。' },
  chats: { title: '还没有私聊', hint: '在现场看完一条留话后可以向作者申请私聊，对方同意后才会开通。' },
};
const chatActivity = (c: ChatMeta) => Math.max(c.updatedAt, c.lastMessageAt ?? 0);

export default function MessagesScreen() {
  const { session } = useSession();
  const { inbox, loading, error, refresh, unseen, markSeen } = useInbox();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(() => isTab(params.tab) ? params.tab : 'joined');
  const [shownParam, setShownParam] = useState(params.tab);
  if (shownParam !== params.tab) { setShownParam(params.tab); if (isTab(params.tab)) setTab(params.tab); }
  const focused = useIsFocused();
  const now = useNow();
  const [refreshing, setRefreshing] = useState(false);
  const [busyChat, setBusyChat] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());

  const lists = useMemo(() => {
    const byUpdate = (a: ThreadMeta, b: ThreadMeta) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
    return {
      // 我参与的 = my own posts plus threads I joined on site (docs/thread-continuation.md); inbox.threads already holds both.
      joined: [...(inbox?.threads ?? [])].sort(byUpdate),
      owned: [...(inbox?.mine ?? [])].sort(byUpdate),
      events: [...(inbox?.events ?? [])].sort((a, b) => b.createdAt - a.createdAt),
      chats: [...(inbox?.chats ?? [])].sort((a, b) => Number(chatClosed(a.state)) - Number(chatClosed(b.state)) || chatActivity(b) - chatActivity(a)),
    };
  }, [inbox]);

  // Remember which 回应 were new when they were shown, so they keep a 新 mark after markSeen clears the badge.
  if (focused && tab === 'replies' && unseen.replies > 0) {
    const ids = lists.events.slice(0, unseen.replies).map(e => e.id);
    if (ids.some(id => !fresh.has(id))) setFresh(new Set([...fresh, ...ids]));
  } else if ((!focused || tab !== 'replies') && fresh.size > 0) setFresh(new Set());

  useEffect(() => {
    if (!focused) return;
    if (tab === 'replies' && unseen.replies > 0) markSeen('replies');
    if (tab === 'chats' && unseen.chats > 0) markSeen('chats');
  }, [focused, tab, unseen.replies, unseen.chats, markSeen]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function pullRefresh() {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }

  async function changeChat(chatId: string, run: () => Promise<ChatMeta>, openAfter = false) {
    setBusyChat(chatId); setActionError('');
    try {
      const chat = await run();
      if (openAfter && chat.state === 'active') router.push({ pathname: '/chat/[id]', params: { id: chat.id } });
    } catch (e) {
      setActionError(describeError(e));
      refresh();
    } finally {
      setBusyChat(null);
    }
  }

  const rows: Row[] = tab === 'joined' ? lists.joined.map(thread => ({ key: thread.id, kind: 'thread', thread }))
    : tab === 'owned' ? lists.owned.map(thread => ({ key: thread.id, kind: 'thread', thread }))
    : tab === 'replies' ? lists.events.map(event => ({ key: event.id, kind: 'event', event }))
    : lists.chats.map(chat => ({ key: chat.id, kind: 'chat', chat }));

  const openPlace = (id: string) => router.push({ pathname: '/place/[id]', params: { id } });

  function renderRow({ item }: { item: Row }) {
    if (item.kind === 'thread') return <ThreadRow thread={item.thread} now={now} onPress={() => openPlace(item.thread.id)} />;
    if (item.kind === 'event') return <EventRow event={item.event} now={now} fresh={fresh.has(item.event.id)} onPress={() => openPlace(item.event.postId)} />;
    const chat = item.chat;
    return <ChatRow chat={chat} now={now} busy={busyChat === chat.id}
      onOpen={() => router.push({ pathname: '/chat/[id]', params: { id: chat.id } })}
      onAccept={() => changeChat(chat.id, () => respondChat(chat.id, true), true)}
      onDecline={() => confirmChatChange('decline', () => changeChat(chat.id, () => respondChat(chat.id, false)))}
      onCancel={() => confirmChatChange('cancel', () => changeChat(chat.id, () => cancelChat(chat.id)))} />;
  }

  const empty = EMPTY[tab];
  const firstLoad = !inbox && !error && !!session;
  const listEmpty = !session
    ? <View style={ui.panel}>
      <Text style={ui.body}>登录演示账号后查看消息</Text>
      <Text style={ui.muted}>演示登录不会连接微信或 Apple。</Text>
      <Action secondary title="去登录" onPress={() => router.push('/login')} />
    </View>
    : firstLoad ? <View style={s.loading}><ActivityIndicator color={colors.accent} /><Text style={ui.muted}>正在读取消息</Text></View>
    : inbox ? <View style={ui.panel}>
      <Text style={ui.body}>{empty.title}</Text>
      <Text style={ui.muted}>{empty.hint}</Text>
      {empty.action ? <Action secondary title={empty.action.title} onPress={() => router.navigate(empty.action!.href)} /> : null}
    </View> : undefined;

  return <Screen>
    <View style={s.header}>
      <View style={s.titleRow}>
        <Text accessibilityRole="header" style={s.title}>消息</Text>
        <DemoBadge label="本机演示数据" />
      </View>
      <Segmented accessibilityLabel="消息分类" value={tab} onChange={setTab} options={[
        { value: 'joined', label: '我参与的' },
        { value: 'owned', label: '我留下的' },
        { value: 'replies', label: '回应', badge: unseen.replies },
        { value: 'chats', label: '私聊', badge: unseen.chats },
      ]} />
      <Text style={ui.muted}>{SUBTITLE[tab]}</Text>
      <Notice tone="error" message={error ? describeError(error) : ''} actionLabel={loading ? undefined : '重试'} onAction={() => { refresh(); }} />
      <Notice tone="error" message={actionError} />
    </View>
    <FlatList data={rows} keyExtractor={row => row.key} renderItem={renderRow} contentContainerStyle={s.list}
      ItemSeparatorComponent={Separator} ListEmptyComponent={listEmpty}
      ListFooterComponent={rows.length > 0 ? <Text style={s.footer}>{tab === 'replies' ? '站内定时刷新，不是推送通知。' : '只显示地点和时间，原文请进入对话查看。'}</Text> : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullRefresh} tintColor={colors.accent} />} />
  </Screen>;
}

function Separator() {
  return <View style={s.separator} />;
}
const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontSize: 28, fontWeight: '600', lineHeight: 38 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, flexGrow: 1 },
  separator: { height: 10 },
  loading: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingTop: 18 },
});
