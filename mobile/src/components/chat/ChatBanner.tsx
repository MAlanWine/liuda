import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatMeta } from '../../api';
import { DemoBadge } from '../common/DemoBadge';
import { chatClosed } from '../messages/ChatRow';
import { colors } from '../ui';

function copyFor(chat: ChatMeta): { text: string; credit: boolean } {
  const requester = chat.role === 'requester';
  switch (chat.state) {
    case 'pending': return requester
      ? { text: '私聊申请已发出，等待对方同意。对方同意时会消耗你 1 次演示权益。', credit: true }
      : { text: '对方想和你私聊。接受后会消耗对方 1 次演示权益，你接收和回复都免费。', credit: true };
    case 'active': return requester
      ? { text: '私聊已开通，已消耗 1 次演示权益。双方离场后也能继续聊。', credit: true }
      : { text: '私聊已开通，双方离场后也能继续聊。你接收和回复都免费。', credit: false };
    case 'declined': return { text: requester ? '对方没有接受这次私聊。' : '你已拒绝这次私聊。', credit: false };
    case 'cancelled': return { text: requester ? '这次私聊申请已撤回或已失效。' : '对方已撤回这次私聊申请。', credit: false };
    case 'destroyed': return { text: '这段私聊已结束，双方的站内消息都已删除。', credit: false };
  }
}

/**
 * State banner on the chat screen (pending / active / declined / cancelled / destroyed). Pending chats carry the
 * actions: author 接受 / 拒绝, requester 撤回申请. 演示权益 lines carry a 演示 tag (mock counter, no real payment).
 */
export function ChatBanner({ chat, busy, onAccept, onDecline, onCancel }: {
  chat: ChatMeta; busy: boolean; onAccept: () => void; onDecline: () => void; onCancel: () => void;
}) {
  const { text, credit } = copyFor(chat);
  const pending = chat.state === 'pending';
  return <View style={[s.banner, chatClosed(chat.state) && s.closed]}>
    <View style={s.row}>
      <Text accessibilityLiveRegion="polite" style={s.text}>{text}</Text>
      {credit ? <DemoBadge label="演示权益" /> : null}
    </View>
    {pending && chat.role === 'author' ? <View style={s.actions}>
      <Button title="拒绝" onPress={onDecline} disabled={busy} />
      <Button title={busy ? '处理中…' : '接受'} primary onPress={onAccept} disabled={busy} />
    </View> : null}
    {pending && chat.role === 'requester' ? <View style={s.actions}>
      <Button title={busy ? '处理中…' : '撤回申请'} onPress={onCancel} disabled={busy} />
    </View> : null}
  </View>;
}

function Button({ title, onPress, disabled, primary = false }: { title: string; onPress: () => void; disabled: boolean; primary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, primary && s.primary, disabled && s.disabled, pressed && s.pressed]}>
    <Text style={[s.buttonText, primary && s.primaryText]}>{title}</Text>
  </Pressable>;
}
const s = StyleSheet.create({
  banner: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10 },
  closed: { backgroundColor: colors.raised },
  row: { gap: 8 },
  text: { color: colors.subtle, fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  button: { minHeight: 44, minWidth: 88, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
  primary: { backgroundColor: colors.accent },
  buttonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  primaryText: { color: colors.onAccent },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
});
