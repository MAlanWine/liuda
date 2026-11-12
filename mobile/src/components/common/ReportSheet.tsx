import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { describeError, type ReportReason, type ReportTarget } from '../../api';
import { block, report } from '../../state/actions';
import { usePosition } from '../../state/position';
import { Action, colors, ui } from '../ui';
import { Notice } from './Notice';
import { Sheet } from './Sheet';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: '广告或垃圾信息' },
  { value: 'abuse', label: '骚扰或攻击' },
  { value: 'privacy', label: '泄露他人隐私' },
  { value: 'illegal', label: '违法违规' },
  { value: 'other', label: '其他' },
];

/**
 * 举报 / 屏蔽 sheet for a post, comment or chat. Reporting hides the target for me at once; 屏蔽 asks for
 * confirmation. Review is a demo stub (演示审核). Calls `onDone` after a successful report or block.
 */
export function ReportSheet({ visible, target, onClose, onDone, allowBlock = true }: {
  visible: boolean; target: ReportTarget | null; onClose: () => void;
  onDone?: (result: { kind: 'report'; hidden: boolean } | { kind: 'block' }) => void; allowBlock?: boolean;
}) {
  const { fix } = usePosition();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function close() {
    if (busy) return;
    setReason(null); setNote(''); setError('');
    onClose();
  }

  async function submit() {
    if (!target || !reason) return;
    setBusy(true); setError('');
    try {
      const res = await report(target, reason, note.slice(0, 200));
      setBusy(false);
      setReason(null); setNote('');
      onDone?.({ kind: 'report', hidden: res.hidden });
      onClose();
    } catch (e) {
      setBusy(false);
      setError(describeError(e));
    }
  }

  function confirmBlock() {
    if (!target) return;
    Alert.alert('屏蔽对方？', '屏蔽后不再看到对方的留话、接话和私聊。可在「我 › 已屏蔽」解除。', [
      { text: '取消', style: 'cancel' },
      { text: '屏蔽', style: 'destructive', onPress: async () => {
        setBusy(true); setError('');
        try {
          await block(target, fix);
          setBusy(false);
          onDone?.({ kind: 'block' });
          onClose();
        } catch (e) {
          setBusy(false);
          setError(describeError(e));
        }
      } },
    ]);
  }

  return <Sheet visible={visible} onClose={close} title="举报">
    <Text style={ui.muted}>举报后这条内容会立即对你隐藏。当前为演示审核，不会提交到真实审核服务。</Text>
    <View style={s.list}>
      {REASONS.map(r => {
        const selected = reason === r.value;
        return <Pressable key={r.value} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setReason(r.value)}
          style={({ pressed }) => [s.option, selected && s.selected, pressed && s.pressed]}>
          <Text style={[s.optionText, selected && s.selectedText]}>{r.label}</Text>
        </Pressable>;
      })}
    </View>
    <TextInput value={note} onChangeText={setNote} placeholder="补充说明（可选）" placeholderTextColor={colors.muted} maxLength={200}
      multiline style={[ui.input, s.note]} accessibilityLabel="补充说明" />
    <Notice tone="error" message={error} />
    <Action title={busy ? '正在提交…' : '提交举报'} disabled={!reason || !target || busy} onPress={submit} />
    {allowBlock && <Action secondary title="屏蔽对方" disabled={!target || busy} onPress={confirmBlock} />}
  </Sheet>;
}
const s = StyleSheet.create({
  list: { gap: 8 },
  option: { minHeight: 46, borderRadius: 14, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: colors.raised },
  selected: { borderWidth: 1, borderColor: colors.accent },
  pressed: { opacity: 0.75 },
  optionText: { color: colors.text, fontSize: 15 },
  selectedText: { color: colors.accent, fontWeight: '600' },
  note: { minHeight: 72, backgroundColor: colors.raised, textAlignVertical: 'top' },
});
