import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Comment } from '../../api';
import { formatRelative } from '../../domain/time';
import { Author } from '../Author';
import { colors, ui } from '../ui';

/**
 * Replies of a `full` thread: author alias (路人 XXXX / 楼主, mine = my profile), relative time, 续聊 tag for
 * `entry: 'continuation'` (no claim about where that person is now). Others' replies offer 举报 via `onReport`.
 */
export function CommentList({ comments, total, now, onReport }: {
  comments: Comment[]; total: number; now: number; onReport: (comment: Comment) => void;
}) {
  return <View style={s.list}>
    <View style={s.header}>
      <Text accessibilityRole="header" style={s.title}>这里的接话</Text>
      <Text style={ui.muted}>{Math.max(total, comments.length)} 句</Text>
    </View>
    {comments.length === 0
      ? <Text style={ui.muted}>还没有人接话。你可以留下第一句。</Text>
      : comments.map(item => <View key={item.id} style={[ui.panel, item.mine && s.mine]}>
        <View style={s.meta}>
          <View style={s.author}><Author author={item.author} /></View>
          {item.entry === 'continuation' && <Text style={s.tag} accessibilityLabel="续聊：离场后继续的回复">续聊</Text>}
          <Text style={ui.muted}>{formatRelative(item.createdAt, now)}</Text>
        </View>
        <Text style={ui.body}>{item.text}</Text>
        {!item.mine && <Pressable accessibilityRole="button" accessibilityLabel="举报这条接话" hitSlop={10} onPress={() => onReport(item)} style={({ pressed }) => [s.report, pressed && s.pressed]}>
          <Text style={s.reportText}>举报</Text>
        </Pressable>}
      </View>)}
  </View>;
}

const s = StyleSheet.create({
  list: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: '600' },
  mine: { borderLeftWidth: 2, borderLeftColor: colors.accent },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: { flex: 1, minWidth: 0 },
  tag: { color: colors.muted, fontSize: 10, lineHeight: 16, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.tag, overflow: 'hidden' },
  report: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center' },
  reportText: { color: colors.muted, fontSize: 12 },
  pressed: { opacity: 0.7 },
});
