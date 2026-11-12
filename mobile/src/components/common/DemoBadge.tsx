import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../ui';

/** Small tag that marks mock / simulated things, e.g. `<DemoBadge label="模拟位置" />`. Default label 演示. */
export function DemoBadge({ label = '演示' }: { label?: string }) {
  return <View accessible accessibilityLabel={label} style={s.badge}><Text style={s.text}>{label}</Text></View>;
}
const s = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.demoFill },
  text: { color: colors.demo, fontSize: 11, lineHeight: 16, fontWeight: '600' },
});
