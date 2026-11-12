import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PostSummary } from '../../api';
import type { ChatEntry } from '../../domain/chat';
import { Sheet } from '../common/Sheet';
import { colors, ui } from '../ui';

type Item = { key: string; label: string; hint?: string; icon: keyof typeof Ionicons.glyphMap; danger?: boolean; onPress: () => void };

/**
 * ⋯ button + sheet for the place detail: 申请私聊 (on site, not my own, full tier; 已申请 / 打开私聊 when I already have an
 * open request), 举报 / 屏蔽 (others' posts; 举报 only at dot tier, where blocking is not offered), 删除 (my own post).
 * The parent owns the follow-up sheets and confirmation; this only picks.
 */
export function ThreadMenu({ post, canRequestChat, chat = { kind: 'request' }, onRequestChat, onOpenChat, onReport, onDelete }: {
  post: PostSummary; canRequestChat: boolean; chat?: ChatEntry; onRequestChat: () => void; onOpenChat: (chatId: string) => void;
  onReport: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pick = (fn: () => void) => () => { setOpen(false); setTimeout(fn, 350); };
  const items: Item[] = [];
  if (!post.owned && chat.kind !== 'request') {
    const chatId = chat.chatId;
    items.push({ key: 'openChat', label: chat.label, icon: 'chatbubbles-outline', onPress: pick(() => onOpenChat(chatId)),
      hint: chat.kind === 'pending' ? '已经申请过，对方同意后就能开始聊' : undefined });
  } else if (!post.owned && post.level === 'full') {
    items.push({ key: 'chat', label: '申请私聊', icon: 'chatbubbles-outline', onPress: pick(onRequestChat),
      hint: canRequestChat ? '使用 1 次演示权益（对方接受时扣除）' : '需要在现场才能申请' });
  }
  // Blocking needs at least the preview tier (server rule), so a dot only offers 举报.
  if (!post.owned) items.push({ key: 'report', label: post.level === 'dot' ? '举报' : '举报或屏蔽', icon: 'flag-outline', onPress: pick(onReport) });
  if (post.owned) items.push({ key: 'delete', label: '删除这条留话', icon: 'trash-outline', danger: true, onPress: pick(onDelete), hint: '删除后所有人都无法再查看和接话' });

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="更多操作" hitSlop={10} onPress={() => setOpen(true)} style={({ pressed }) => [s.trigger, pressed && s.pressed]}>
      <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
    </Pressable>
    <Sheet visible={open} onClose={() => setOpen(false)} title="更多">
      {items.length === 0 ? <Text style={ui.muted}>暂无可用操作。</Text> : items.map(item => {
        const disabled = item.key === 'chat' && !canRequestChat;
        return <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={item.onPress}
          style={({ pressed }) => [s.item, disabled && s.disabled, pressed && s.pressed]}>
          <Ionicons name={item.icon} size={20} color={item.danger ? colors.danger : colors.text} />
          <View style={s.flex}>
            <Text style={[s.label, item.danger && s.danger]}>{item.label}</Text>
            {item.hint ? <Text style={ui.muted}>{item.hint}</Text> : null}
          </View>
        </Pressable>;
      })}
    </Sheet>
  </>;
}

const s = StyleSheet.create({
  trigger: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  item: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.raised },
  flex: { flex: 1 },
  label: { color: colors.text, fontSize: 16, fontWeight: '500' },
  danger: { color: colors.danger },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
