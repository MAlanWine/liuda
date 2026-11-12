import { StyleSheet, Text, View } from 'react-native';
import type { PublicAuthor } from '../api/types';
import { authorLabel } from '../domain/author';
import { useProfile } from '../state/profile';
import { Avatar } from './Avatar';
import { colors } from './ui';

/**
 * Author row: my items show my own profile (+ 我), others their per-thread alias (路人 XXXX) with a 楼主 badge for the
 * post author and a 模拟用户 tag for simulated users.
 */
export function Author({ author }: { author: PublicAuthor }) {
  const { profile } = useProfile();
  const { name, badges, simulated } = authorLabel(author, profile.nickname);
  const badgeText = badges.join(' · ');
  return <View style={s.row} accessible accessibilityLabel={[name, badgeText, simulated ? '模拟用户' : ''].filter(Boolean).join('，')}>
    <Avatar uri={author.isMe ? profile.avatar : author.avatar} size={30} />
    <Text numberOfLines={1} style={s.name}>{name}</Text>
    {badgeText ? <Text style={s.badge}>{badgeText}</Text> : null}
    {simulated ? <Text style={[s.badge, s.sim]}>模拟用户</Text> : null}
  </View>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  name: { color: colors.subtle, fontSize: 13, lineHeight: 21, flexShrink: 1 },
  badge: { color: colors.muted, fontSize: 10, lineHeight: 16, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.tag },
  sim: { color: colors.demo, backgroundColor: colors.demoFill },
});
