import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThreadMeta } from '../../api';
import { formatRelative } from '../../domain/time';
import { colors } from '../ui';

/** One thread in 我参与的 / 我留下的: place name, reply count, last activity. Metadata only (no post text). */
export function ThreadRow({ thread, now, onPress }: { thread: ThreadMeta; now: number; onPress: () => void }) {
  const when = formatRelative(thread.updatedAt || thread.createdAt, now);
  const role = thread.owned ? '我留下的' : '已参与 · 离场也可继续';
  const count = thread.commentCount > 0 ? `${thread.commentCount} 条回复` : '还没有回复';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${thread.name}，${role}，${count}，${when}`} accessibilityHint="打开这条对话"
    onPress={onPress} style={({ pressed }) => [s.row, pressed && s.pressed]}>
    <View style={s.main}>
      <Text numberOfLines={1} style={s.name}>{thread.name}</Text>
      <Text numberOfLines={1} style={s.meta}>{count} · {role}</Text>
    </View>
    <Text style={s.time}>{when}</Text>
    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
  </Pressable>;
}
const s = StyleSheet.create({
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, backgroundColor: colors.surface },
  pressed: { opacity: 0.72 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  name: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  time: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
