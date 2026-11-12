import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { describeError, isApiError, type PositionEvidence, type PostSummary } from '../../api';
import { editAttempt, emptyAttempt, exclusive, renewAttempt, type Attempt } from '../../domain/attempt';
import { codePoints, TEXT_MAX, THREAD_CAP } from '../../domain/text';
import { replyTo } from '../../state/actions';
import { Notice } from '../common/Notice';
import { AlignedTextInput } from '../KeyboardAlignedScrollView';
import { Action, colors, ui } from '../ui';

/**
 * Reply box. `onsite` -> 在这里，接一句 / 发送接话 (`comment`); participant off site -> 已参与这条对话 · 离场也可继续 /
 * 继续接话 (`continueComment`, D-27). The draft (`text` + its requestId, minted when the text changes and reused on
 * retry) is owned by the screen (`draft` / `onDraft`), so it survives this box unmounting when the tier changes.
 * The draft is cleared only after a successful write (D-18). One submit in flight at a time.
 */
export function Composer({ post, onsite, fix, draft, onDraft }: {
  post: PostSummary; onsite: boolean; fix: PositionEvidence | null; draft: Attempt; onDraft: (next: Attempt) => void;
}) {
  const text = draft.text;
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const length = codePoints(text.trim());
  const tooLong = codePoints(text) > TEXT_MAX;
  const full = post.commentCount >= THREAD_CAP;

  function change(value: string) {
    onDraft(editAttempt(value));
    setError('');
    setSent('');
  }

  const submit = () => exclusive(inFlight, async () => {
    const body = text.trim();
    if (!body || tooLong) return;
    const attempt = draft.requestId ? draft : renewAttempt(draft);
    if (attempt !== draft) onDraft(attempt);
    setBusy(true);
    setError('');
    try {
      await replyTo(post, body, onsite ? fix : null, attempt.requestId as string);
      onDraft(emptyAttempt);
      setSent(onsite ? '已接上。这条对话已进入「消息 › 我参与的」。' : '已继续接话。');
    } catch (e) {
      if (isApiError(e) && e.code === 'REQUEST_CONFLICT') onDraft(renewAttempt(attempt));
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  });

  const label = onsite ? '在这里，接一句' : '已参与这条对话 · 离场也可继续';
  const button = busy ? '正在发送…' : onsite ? '发送接话' : '继续接话';
  return <View style={s.box}>
    <Text style={ui.label}>{label}</Text>
    <AlignedTextInput value={text} onChangeText={change} multiline editable={!busy && !full} placeholder={full ? '这条留话的接话已满' : '有什么想接着说的？'}
      placeholderTextColor={colors.muted} style={[ui.input, s.input]} textAlignVertical="top" accessibilityLabel="接话内容" />
    <View style={s.meta}>
      <Text style={[ui.muted, tooLong && s.over]}>{codePoints(text)} / {TEXT_MAX}</Text>
      <Text style={ui.muted}>对他人显示为本条对话的临时代号</Text>
    </View>
    <Notice message={full ? '本轮试用每条留话最多 100 条回复。' : ''} />
    <Notice tone="error" message={error} />
    <Notice message={sent} />
    <Action title={button} disabled={busy || full || !length || tooLong} onPress={() => { submit(); }} />
  </View>;
}

const s = StyleSheet.create({
  box: { gap: 10 },
  input: { minHeight: 110 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  over: { color: colors.danger },
});
