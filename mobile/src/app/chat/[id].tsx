import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { describeError, type ChatMessage, type ChatMeta, type ReportTarget } from '../../api';
import { Author } from '../../components/Author';
import { Bubble } from '../../components/chat/Bubble';
import { ChatBanner } from '../../components/chat/ChatBanner';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { ErrorView } from '../../components/common/ErrorView';
import { Notice } from '../../components/common/Notice';
import { ReportSheet } from '../../components/common/ReportSheet';
import { confirmChatChange } from '../../components/messages/ChatRow';
import { colors } from '../../components/ui';
import { formatRelative } from '../../domain/time';
import { cancelChat, destroyChat, respondChat } from '../../state/actions';
import { useChat } from '../../state/chats';
import { useNow } from '../../state/now';

const TIME_GAP_MS = 5 * 60_000;

function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
}

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/messages');
}

/** Private chat (rules 7–9). Never starts GPS: an accepted chat continues anywhere. */
export default function ChatScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { chat, messages, loading, error, refresh, send } = useChat(id);
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  async function change(run: () => Promise<ChatMeta>) {
    setBusy(true); setNotice('');
    try { await run(); await refresh(); } catch (e) { setNotice(describeError(e)); refresh(); } finally { setBusy(false); }
  }

  function confirmDestroy() {
    Alert.alert('结束并删除这段私聊？',
      '结束后，你和对方的站内消息都会被删除，双方都不能再继续这段私聊，也无法恢复。已被截图、录屏或另存的内容，平台无法收回。', [
        { text: '取消', style: 'cancel' },
        { text: '结束并删除', style: 'destructive', onPress: () => { change(() => destroyChat(id)); } },
      ]);
  }

  function openMenu() {
    if (!chat || busy) return;
    const canDestroy = chat.state !== 'destroyed';
    const items: { label: string; run: () => void; destructive?: boolean }[] = [
      { label: '举报或屏蔽', run: () => setReportTarget({ kind: 'chat', chatId: chat.id }) },
      ...canDestroy ? [{ label: '结束并删除', run: confirmDestroy, destructive: true }] : [],
    ];
    if (Platform.OS === 'ios') {
      const destructive = items.findIndex(i => i.destructive);
      ActionSheetIOS.showActionSheetWithOptions({
        title: `来自「${chat.placeName}」的私聊`, options: [...items.map(i => i.label), '取消'],
        cancelButtonIndex: items.length, destructiveButtonIndex: destructive >= 0 ? destructive : undefined,
      }, index => { items[index]?.run(); });
    } else {
      Alert.alert('私聊选项', undefined, [...items.map(i => ({ text: i.label, style: i.destructive ? 'destructive' as const : 'default' as const, onPress: i.run })),
        { text: '取消', style: 'cancel' }]);
    }
  }

  // Inverted list: newest first. Times show on the first message and after a 5-minute gap.
  const items = useMemo(() => {
    const out: { message: ChatMessage; showTime: boolean }[] = [];
    let last = 0;
    for (const message of messages) {
      out.push({ message, showTime: last === 0 || message.createdAt - last >= TIME_GAP_MS });
      last = message.createdAt;
    }
    return out.reverse();
  }, [messages]);

  const header = <Stack.Screen options={{
    title: '私聊',
    headerRight: chat ? () => <Pressable accessibilityRole="button" accessibilityLabel="更多操作：举报、屏蔽、结束并删除" accessibilityState={{ disabled: busy }}
      disabled={busy} hitSlop={10} onPress={openMenu} style={({ pressed }) => [s.menu, (pressed || busy) && s.pressed]}>
      <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
    </Pressable> : undefined,
  }} />;

  if (!chat) {
    if (!id || error?.code === 'CHAT_MISSING') return <View style={s.screen}>{header}
      <ErrorView title="这段私聊已不存在" message="它可能已被结束并删除，或已被举报隐藏。" retryLabel="回到消息" onRetry={leave} />
    </View>;
    if (error) return <View style={s.screen}>{header}<ErrorView message={describeError(error)} onRetry={() => { refresh(); }} /></View>;
    return <View style={[s.screen, s.center]}>{header}<ActivityIndicator color={colors.accent} /><Text style={s.muted}>{loading ? '正在打开私聊' : '正在连接'}</Text></View>;
  }

  const active = chat.state === 'active';
  const banner = <ChatBanner chat={chat} busy={busy}
    onAccept={() => { change(() => respondChat(chat.id, true)); }}
    onDecline={() => confirmChatChange('decline', () => { change(() => respondChat(chat.id, false)); })}
    onCancel={() => confirmChatChange('cancel', () => { change(() => cancelChat(chat.id)); })} />;
  const greeting = chat.greeting
    ? <Bubble text={chat.greeting} mine={chat.role === 'requester'} caption="招呼" time={formatRelative(chat.createdAt, now)} />
    : null;

  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
    {header}
    <View style={s.top}>
      <View style={s.peer}><Author author={chat.peer} /></View>
      <Text numberOfLines={1} style={s.place}>来自「{chat.placeName}」</Text>
      {active ? null : banner}
      {busy ? <View style={s.busy} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.accent} /><Text style={s.muted}>处理中…</Text></View> : null}
      <Notice tone="error" message={notice || (error ? describeError(error) : '')} />
    </View>
    <FlatList inverted data={items} keyExtractor={item => item.message.id} contentContainerStyle={s.list}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
      renderItem={({ item }) => <Bubble text={item.message.text} mine={item.message.mine}
        time={item.showTime ? formatRelative(item.message.createdAt, now) : undefined}
        onLongPress={item.message.mine ? undefined : () => setReportTarget({ kind: 'chat', chatId: chat.id, messageId: item.message.id })} />}
      ListFooterComponent={<View style={s.intro}>
        {active ? banner : null}
        {greeting}
      </View>}
      ListHeaderComponent={active && messages.length === 0 && !chat.greeting ? <Text style={s.emptyHint}>还没有消息，打个招呼吧。</Text> : undefined} />
    {active ? <ChatComposer onSend={send} bottomInset={keyboard ? 0 : insets.bottom} />
      : <View style={[s.closedBar, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={s.muted}>{busy ? '处理中…' : chat.state === 'pending' ? '对方同意后才能发送消息。' : '这段私聊已不能再发送消息。'}</Text>
      </View>}
    <ReportSheet visible={!!reportTarget} target={reportTarget} onClose={() => setReportTarget(null)}
      onDone={result => {
        const wholeChat = reportTarget?.kind === 'chat' && !reportTarget.messageId;
        if (result.kind === 'block' || wholeChat) leave();
        else refresh();
      }} />
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  busy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  menu: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  top: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  peer: { flexDirection: 'row' },
  place: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  list: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  intro: { gap: 10, paddingBottom: 8 },
  emptyHint: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', paddingVertical: 12 },
  closedBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
