import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatMeta, ChatState } from '../../api';
import { formatRelative } from '../../domain/time';
import { Author } from '../Author';
import { colors } from '../ui';

/** Short state label for a chat, from my side (`role`). */
export function chatStateLabel(state: ChatState, role: ChatMeta['role']): string {
  switch (state) {
    case 'pending': return role === 'author' ? '想和你私聊' : '等待对方同意';
    case 'active': return '私聊中';
    case 'declined': return role === 'author' ? '你已拒绝' : '对方未接受';
    case 'cancelled': return role === 'author' ? '对方已撤回' : '申请已撤回';
    case 'destroyed': return '已结束并删除';
  }
}

/** Confirms 拒绝 (author) or 撤回申请 (requester) before calling `run`. */
export function confirmChatChange(kind: 'decline' | 'cancel', run: () => void) {
  if (kind === 'decline') Alert.alert('拒绝这次私聊？', '拒绝后这条申请会关闭，对方不会看到原因。', [
    { text: '取消', style: 'cancel' }, { text: '拒绝', style: 'destructive', onPress: run },
  ]);
  else Alert.alert('撤回私聊申请？', '撤回后对方不能再接受这条申请。', [
    { text: '取消', style: 'cancel' }, { text: '撤回', style: 'destructive', onPress: run },
  ]);
}

/** True for chats that can no longer change (shown greyed in the list). */
export function chatClosed(state: ChatState): boolean {
  return state === 'declined' || state === 'cancelled' || state === 'destroyed';
}

/**
 * One 私聊 row: peer alias (+ 模拟用户), place, state, time. Pending rows carry the actions:
 * author 接受 / 拒绝, requester 撤回. Closed chats are greyed and not openable.
 */
export function ChatRow({ chat, now, busy, onOpen, onAccept, onDecline, onCancel }: {
  chat: ChatMeta; now: number; busy: boolean; onOpen: () => void; onAccept: () => void; onDecline: () => void; onCancel: () => void;
}) {
  const closed = chatClosed(chat.state);
  const pending = chat.state === 'pending';
  const label = chatStateLabel(chat.state, chat.role);
  const when = formatRelative(Math.max(chat.updatedAt, chat.lastMessageAt ?? 0), now);
  return <View style={[s.card, closed && s.closed]}>
    <Pressable accessibilityRole="button" disabled={closed} accessibilityState={{ disabled: closed }}
      accessibilityLabel={`私聊，来自「${chat.placeName}」，${label}，${when}`} accessibilityHint={closed ? undefined : '打开私聊'}
      onPress={onOpen} style={({ pressed }) => [s.body, pressed && s.pressed]}>
      <View style={s.top}>
        <View style={s.author}><Author author={chat.peer} /></View>
        <Text style={s.time}>{when}</Text>
      </View>
      <Text numberOfLines={1} style={s.place}>来自「{chat.placeName}」</Text>
      {pending && chat.greeting ? <Text numberOfLines={2} style={s.greeting}>“{chat.greeting}”</Text> : null}
      <Text style={[s.state, chat.state === 'active' && s.stateActive, pending && chat.role === 'author' && s.stateActive]}>{label}</Text>
    </Pressable>
    {pending && chat.role === 'author' ? <>
      <Text style={s.hint}>接受后会消耗对方 1 次演示权益，你接收和回复免费。</Text>
      <View style={s.actions}>
        <SmallButton title="拒绝" onPress={onDecline} disabled={busy} />
        <SmallButton title={busy ? '处理中…' : '接受'} primary onPress={onAccept} disabled={busy} />
      </View>
    </> : null}
    {pending && chat.role === 'requester' ? <View style={s.actions}>
      <SmallButton title={busy ? '处理中…' : '撤回申请'} onPress={onCancel} disabled={busy} />
    </View> : null}
  </View>;
}

function SmallButton({ title, onPress, disabled, primary = false }: { title: string; onPress: () => void; disabled: boolean; primary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, primary && s.buttonPrimary, disabled && s.disabled, pressed && s.pressed]}>
    <Text style={[s.buttonText, primary && s.buttonTextPrimary]}>{title}</Text>
  </Pressable>;
}
const s = StyleSheet.create({
  card: { borderRadius: 18, backgroundColor: colors.surface, paddingBottom: 4 },
  closed: { opacity: 0.5 },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 6 },
  pressed: { opacity: 0.72 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  author: { flex: 1, minWidth: 0 },
  time: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  place: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  greeting: { color: colors.subtle, fontSize: 14, lineHeight: 21 },
  state: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  stateActive: { color: colors.accent },
  hint: { color: colors.demo, fontSize: 12, lineHeight: 18, paddingHorizontal: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
  button: { minHeight: 44, minWidth: 88, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  buttonTextPrimary: { color: colors.onAccent },
  disabled: { opacity: 0.4 },
});
