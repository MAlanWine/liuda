import { StyleSheet, Text, View } from 'react-native';
import { Action, Screen, colors, ui } from '../ui';

/**
 * Full-area error state with a 重试 button. Store-free so it also works in the root `ErrorBoundary`
 * (rendered outside the providers). `fullScreen` wraps it in `<Screen>`.
 */
export function ErrorView({ title = '这里出了点问题', message, onRetry, retryLabel = '重试', fullScreen = false }: {
  title?: string; message?: string; onRetry?: () => void; retryLabel?: string; fullScreen?: boolean;
}) {
  const body = <View style={s.box}>
    <Text accessibilityRole="header" style={s.title}>{title}</Text>
    <Text accessibilityLiveRegion="polite" style={ui.muted}>{message || '页面暂时无法显示，你的内容不会因此丢失。'}</Text>
    {onRetry ? <Action title={retryLabel} onPress={onRetry} /> : null}
  </View>;
  return fullScreen ? <Screen><View style={s.center}>{body}</View></Screen> : body;
}
const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  box: { padding: 24, gap: 14 },
  title: { color: colors.text, fontSize: 20, fontWeight: '600', lineHeight: 28 },
});
