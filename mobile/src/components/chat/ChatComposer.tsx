import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { describeError } from '../../api';
import { editAttempt, emptyAttempt, exclusive, renewAttempt, type Attempt } from '../../domain/attempt';
import { CHAT_TEXT_MAX, checkText, codePoints } from '../../domain/text';
import { Notice } from '../common/Notice';
import { colors } from '../ui';

/**
 * Chat input (1–500 code points). The requestId is minted when the text changes and passed to `onSend`, so a retry of
 * the same text is idempotent; one send in flight at a time. `onSend` resolves on success (text cleared) or throws
 * (text kept, error shown).
 */
export function ChatComposer({ onSend, bottomInset }: { onSend: (text: string, requestId: string) => Promise<void>; bottomInset: number }) {
  const [attempt, setAttempt] = useState<Attempt>(emptyAttempt);
  const text = attempt.text;
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const length = codePoints(text.trim());
  const valid = checkText(text, CHAT_TEXT_MAX).ok;
  const near = length > CHAT_TEXT_MAX - 50;

  const submit = () => exclusive(inFlight, async () => {
    if (!valid) return;
    const current = attempt.requestId ? attempt : renewAttempt(attempt);
    if (current !== attempt) setAttempt(current);
    setBusy(true); setError('');
    try {
      await onSend(text.trim(), current.requestId as string);
      setAttempt(emptyAttempt);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  });

  return <View style={[s.bar, { paddingBottom: bottomInset + 10 }]}>
    <Notice tone="error" message={error} />
    <View style={s.row}>
      <TextInput value={text} onChangeText={value => { setAttempt(editAttempt(value)); if (error) setError(''); }} placeholder="说点什么…" placeholderTextColor={colors.muted}
        multiline editable={!busy} accessibilityLabel="私聊消息" style={s.input} />
      <Pressable accessibilityRole="button" accessibilityLabel="发送" accessibilityState={{ disabled: !valid || busy }} disabled={!valid || busy} onPress={() => { submit(); }}
        style={({ pressed }) => [s.send, (!valid || busy) && s.disabled, pressed && s.pressed]}>
        {busy ? <ActivityIndicator color={colors.onAccent} /> : <Ionicons name="arrow-up" size={20} color={colors.onAccent} />}
      </Pressable>
    </View>
    {near ? <Text style={[s.count, length > CHAT_TEXT_MAX && s.over]}>{length}/{CHAT_TEXT_MAX}</Text> : null}
  </View>;
}
const s = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingTop: 10, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.background },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: { flex: 1, minHeight: 44, maxHeight: 132, color: colors.text, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16, lineHeight: 22 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
  count: { color: colors.muted, fontSize: 12, textAlign: 'right', paddingRight: 56 },
  over: { color: colors.danger },
});
