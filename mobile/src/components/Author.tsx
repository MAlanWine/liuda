import { StyleSheet, Text, View } from 'react-native';
import { useProfile } from '../state/profile';
import { Avatar } from './Avatar';
import { colors } from './ui';

export function Author({ mine, original = false }: { mine: boolean; original?: boolean }) {
  const { profile } = useProfile();
  return <View style={s.row}>
    <Avatar uri={mine ? profile.avatar : null} size={30} />
    <Text numberOfLines={1} style={s.name}>{mine ? profile.nickname : '路过的人'}</Text>
    {(mine || original) && <Text style={s.badge}>{mine ? original ? '我 · 楼主' : '我' : '楼主'}</Text>}
  </View>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  name: { color: '#dfe3da', fontSize: 13, lineHeight: 21, flexShrink: 1 },
  badge: { color: colors.muted, fontSize: 10, lineHeight: 16, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: '#ffffff0c' },
});
