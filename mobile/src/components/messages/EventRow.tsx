import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { InboxEvent } from '../../api';
import { formatRelative } from '../../domain/time';
import { colors } from '../ui';

/** One 回应 entry (latest activity per thread): place name + time; `fresh` marks it 新. Metadata only. */
export function EventRow({ event, now, fresh, onPress }: { event: InboxEvent; now: number; fresh: boolean; onPress: () => void }) {
  const when = formatRelative(event.createdAt, now);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${fresh ? '新，' : ''}${event.name}，有人接了话，${when}`} accessibilityHint="打开这条对话"
    onPress={onPress} style={({ pressed }) => [s.row, pressed && s.pressed]}>
    <View style={[s.dot, fresh && s.dotFresh]} />
    <View style={s.main}>
      <Text numberOfLines={1} style={s.name}>{event.name}</Text>
      <Text numberOfLines={1} style={s.meta}>有人接了话 · {when}</Text>
    </View>
    {fresh ? <Text style={s.fresh}>新</Text> : null}
    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
  </Pressable>;
}
const s = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, backgroundColor: colors.surface },
  pressed: { opacity: 0.72 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  dotFresh: { backgroundColor: colors.accent },
  main: { flex: 1, minWidth: 0, gap: 3 },
  name: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  fresh: { color: colors.onAccent, backgroundColor: colors.accent, fontSize: 11, lineHeight: 16, fontWeight: '700', paddingHorizontal: 7, borderRadius: 6, overflow: 'hidden' },
});
