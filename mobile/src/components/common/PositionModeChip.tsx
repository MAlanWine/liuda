import { Pressable, StyleSheet, Text } from 'react-native';
import { usePosition } from '../../state/position';
import { colors } from '../ui';

/**
 * Header chip showing the position source; tap toggles 真实定位 ⇄ 模拟位置 (simulated is styled as a demo label).
 * Pass `onPress` to open a chooser instead of toggling.
 */
export function PositionModeChip({ onPress }: { onPress?: () => void }) {
  const { mode, setMode, fresh, fix } = usePosition();
  const simulated = mode === 'simulated';
  const label = simulated ? '模拟位置' : !fix ? '真实定位' : fresh ? `真实定位${fix.accuracy != null ? ` ±${Math.round(fix.accuracy)}m` : ''}` : '定位已过期';
  return <Pressable accessibilityRole="button" accessibilityLabel={`当前${simulated ? '模拟位置' : '真实定位'}，轻点切换为${simulated ? '真实定位' : '模拟位置'}`}
    hitSlop={8} onPress={onPress ?? (() => setMode(simulated ? 'gps' : 'simulated'))}
    style={({ pressed }) => [s.chip, simulated && s.sim, pressed && s.pressed]}>
    <Text numberOfLines={1} style={[s.text, simulated && s.simText]}>{label}</Text>
  </Pressable>;
}
const s = StyleSheet.create({
  chip: { minHeight: 32, paddingHorizontal: 11, borderRadius: 16, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  sim: { backgroundColor: colors.demoFill, borderColor: colors.demo },
  pressed: { opacity: 0.7 },
  text: { color: colors.text, fontSize: 12, fontWeight: '600' },
  simText: { color: colors.demo },
});
