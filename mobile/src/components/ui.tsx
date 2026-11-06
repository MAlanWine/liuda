import { StyleSheet, Text, Pressable, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

export const colors = { background: '#101215', surface: '#1b1e23', text: '#f3f0e8', muted: '#9b9e9b', line: '#30342f', accent: '#d5e6bb' };
export const moods = {
  sage: { background: '#202e29', soft: '#aac0af', ink: '#f1f0dc' },
  sand: { background: '#332c24', soft: '#c8b38e', ink: '#f1e7d2' },
  blue: { background: '#243039', soft: '#aac0ce', ink: '#e8eff1' },
};
export function Screen({ children }: { children: ReactNode }) {
  return <SafeAreaView edges={['top', 'left', 'right']} style={ui.screen}>{children}</SafeAreaView>;
}
export function Action({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.action, secondary && ui.secondary, disabled && ui.disabled, pressed && ui.pressed]}>
    <Text style={[ui.actionText, secondary && ui.secondaryText]}>{title}</Text>
  </Pressable>;
}
export function Loading() {
  return <Screen><View style={ui.center}><ActivityIndicator color={colors.accent} /><Text style={ui.muted}>正在打开留答</Text></View></Screen>;
}
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  content: { padding: 24, gap: 20, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 30, fontWeight: '600', lineHeight: 40 },
  body: { color: colors.text, fontSize: 17, lineHeight: 29 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  label: { color: colors.muted, fontSize: 13, marginBottom: 9 },
  input: { color: colors.text, backgroundColor: colors.surface, borderRadius: 16, padding: 16, fontSize: 16, lineHeight: 26 },
  action: { minHeight: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 13 },
  actionText: { color: '#172019', fontSize: 16, fontWeight: '600' },
  secondary: { backgroundColor: colors.surface },
  secondaryText: { color: colors.text },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
  panel: { backgroundColor: colors.surface, padding: 20, borderRadius: 20, gap: 12 },
  line: { height: 1, backgroundColor: colors.line },
});
