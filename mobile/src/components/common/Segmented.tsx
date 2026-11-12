import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../ui';

export type SegmentedOption<T extends string> = { value: T; label: string; badge?: number };

/** Segmented control (tab-like). Options may carry a numeric badge (hidden when 0). */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: {
  options: readonly SegmentedOption<T>[]; value: T; onChange: (value: T) => void; accessibilityLabel?: string;
}) {
  return <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={s.track}>
    {options.map(option => {
      const selected = option.value === value;
      return <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected }}
        accessibilityLabel={option.badge ? `${option.label}，${option.badge} 条新` : option.label}
        onPress={() => { if (!selected) onChange(option.value); }}
        style={({ pressed }) => [s.item, selected && s.selected, pressed && s.pressed]}>
        <Text numberOfLines={1} style={[s.label, selected && s.selectedLabel]}>{option.label}</Text>
        {option.badge ? <View style={s.badge}><Text style={s.badgeText}>{option.badge > 99 ? '99+' : option.badge}</Text></View> : null}
      </Pressable>;
    })}
  </View>;
}
const s = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 3, gap: 3 },
  item: { flex: 1, minHeight: 44, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
  selected: { backgroundColor: colors.raised },
  pressed: { opacity: 0.75 },
  label: { color: colors.muted, fontSize: 14, fontWeight: '500' },
  selectedLabel: { color: colors.text, fontWeight: '600' },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.onAccent, fontSize: 11, fontWeight: '700' },
});
