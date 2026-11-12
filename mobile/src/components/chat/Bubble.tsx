import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../ui';

/**
 * Chat bubble: mine on the right (accent), the peer's on the left. `caption` (e.g. 招呼) sits above the text,
 * `time` below. `onLongPress` (peer messages) opens 举报.
 */
export function Bubble({ text, mine, time, caption, onLongPress }: {
  text: string; mine: boolean; time?: string; caption?: string; onLongPress?: () => void;
}) {
  const who = mine ? '我' : '对方';
  return <View style={[s.wrap, mine ? s.wrapMine : s.wrapPeer]}>
    <Pressable accessible accessibilityLabel={`${who}${caption ? `（${caption}）` : ''}：${text}${time ? `，${time}` : ''}`}
      accessibilityHint={onLongPress ? '长按可举报这条消息' : undefined} disabled={!onLongPress} onLongPress={onLongPress} delayLongPress={400}
      style={({ pressed }) => [s.bubble, mine ? s.mine : s.peer, pressed && s.pressed]}>
      {caption ? <Text style={[s.caption, mine && s.captionMine]}>{caption}</Text> : null}
      <Text selectable style={[s.text, mine && s.textMine]}>{text}</Text>
    </Pressable>
    {time ? <Text style={[s.time, mine && s.timeMine]}>{time}</Text> : null}
  </View>;
}
const s = StyleSheet.create({
  wrap: { maxWidth: '82%', gap: 4, marginVertical: 4 },
  wrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  wrapPeer: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  mine: { backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  peer: { backgroundColor: colors.surface, borderBottomLeftRadius: 6 },
  pressed: { opacity: 0.8 },
  caption: { color: colors.muted, fontSize: 11, lineHeight: 16, marginBottom: 2 },
  captionMine: { color: colors.onAccent, opacity: 0.7 },
  text: { color: colors.text, fontSize: 16, lineHeight: 24 },
  textMine: { color: colors.onAccent },
  time: { color: colors.muted, fontSize: 11, lineHeight: 16, paddingHorizontal: 4 },
  timeMine: { textAlign: 'right' },
});
