import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../ui';

/**
 * Inline status line (`accessibilityLiveRegion="polite"`). Renders nothing for an empty message.
 * `tone="error"` uses the danger colour; an optional action shows as a text button.
 */
export function Notice({ message, tone = 'info', actionLabel, onAction }: {
  message: string | null | undefined; tone?: 'info' | 'error'; actionLabel?: string; onAction?: () => void;
}) {
  if (!message) return null;
  return <View style={s.row}>
    <Text accessibilityLiveRegion="polite" style={[s.text, tone === 'error' && s.error]}>{message}</Text>
    {actionLabel && onAction ? <Pressable accessibilityRole="button" hitSlop={10} onPress={onAction} style={({ pressed }) => [s.action, pressed && s.pressed]}>
      <Text style={s.actionText}>{actionLabel}</Text>
    </Pressable> : null}
  </View>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  text: { color: colors.muted, fontSize: 13, lineHeight: 21, flexShrink: 1 },
  error: { color: colors.danger },
  action: { minHeight: 32, justifyContent: 'center' },
  actionText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
