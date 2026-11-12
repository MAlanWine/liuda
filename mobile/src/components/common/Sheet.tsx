import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../ui';

/**
 * Bottom sheet over a scrim (RN `Modal`). Tapping the scrim or 关闭 calls `onClose`.
 * Content scrolls when taller than ~80% of the screen and avoids the keyboard.
 */
export function Sheet({ visible, onClose, title, children, closeLabel = '关闭' }: {
  visible: boolean; onClose: () => void; title?: string; children: ReactNode; closeLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView behavior="padding" style={s.fill}>
      <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={s.scrim} />
      <View accessibilityViewIsModal style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text accessibilityRole="header" numberOfLines={1} style={s.title}>{title ?? ''}</Text>
          <Pressable accessibilityRole="button" hitSlop={12} onPress={onClose} style={({ pressed }) => [s.close, pressed && s.pressed]}>
            <Text style={s.closeText}>{closeLabel}</Text>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>{children}</ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const s = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: { maxHeight: '82%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, minHeight: 44, gap: 12 },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '600' },
  close: { minHeight: 44, justifyContent: 'center' },
  closeText: { color: colors.muted, fontSize: 15 },
  pressed: { opacity: 0.7 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, gap: 14 },
});
