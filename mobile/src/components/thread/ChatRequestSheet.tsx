import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { api, describeError, isApiError, type ChatMeta, type PositionEvidence, type PostSummary } from '../../api';
import { editAttempt, emptyAttempt, exclusive, renewAttempt, type Attempt } from '../../domain/attempt';
import { codePoints, GREETING_MAX } from '../../domain/text';
import { requestChat } from '../../state/actions';
import { DemoBadge } from '../common/DemoBadge';
import { Notice } from '../common/Notice';
import { Sheet } from '../common/Sheet';
import { Action, colors, ui } from '../ui';

/**
 * 申请私聊 with the post's author (on site, presence `chat`). Shows the remaining 演示权益 (`api.entitlements`, a mock
 * counter — no real payment); one credit is used when the author accepts. On success calls `onSent(chat)`.
 */
export function ChatRequestSheet({ visible, post, fix, onClose, onSent }: {
  visible: boolean; post: PostSummary; fix: PositionEvidence | null; onClose: () => void; onSent: (chat: ChatMeta) => void;
}) {
  const [credits, setCredits] = useState<number | null>(null);
  // Greeting + its requestId: minted when the greeting changes, reused on retry, renewed on REQUEST_CONFLICT.
  const [attempt, setAttempt] = useState<Attempt>(emptyAttempt);
  const greeting = attempt.text;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    api.entitlements({})
      .then(res => { if (active) setCredits(res.chatCredits); })
      .catch(e => { if (active) setError(describeError(e)); });
    return () => { active = false; };
  }, [visible]);

  function close() {
    if (busy) return;
    setError('');
    onClose();
  }

  const submit = () => exclusive(inFlight, async () => {
    const text = greeting.trim();
    if (!text || !fix) return;
    const current = attempt.requestId ? attempt : renewAttempt(attempt);
    if (current !== attempt) setAttempt(current);
    setBusy(true);
    setError('');
    try {
      const chat = await requestChat(post, text, fix, current.requestId as string);
      setAttempt(emptyAttempt);
      setBusy(false);
      onSent(chat);
    } catch (e) {
      if (isApiError(e) && e.code === 'REQUEST_CONFLICT') setAttempt(renewAttempt(current));
      setBusy(false);
      setError(describeError(e));
    }
  });

  const length = codePoints(greeting.trim());
  const tooLong = codePoints(greeting) > GREETING_MAX;
  const empty = credits === 0;
  return <Sheet visible={visible} onClose={close} title="申请私聊">
    <View style={s.row}>
      <DemoBadge label="演示权益" />
      <Text style={ui.muted}>{credits === null ? '正在查询剩余次数…' : `剩余 ${credits} 次 · 对方接受后扣 1 次`}</Text>
    </View>
    <Text style={ui.muted}>私聊只在你和楼主之间。对方看到的是你在这条对话里的临时代号，接受后才能开始聊天，任一方可随时结束并删除。演示版本不涉及真实支付。</Text>
    <TextInput value={greeting} onChangeText={value => { setAttempt(editAttempt(value)); setError(''); }} multiline editable={!busy}
      placeholder="打个招呼，说明你为什么想聊" placeholderTextColor={colors.muted} style={[ui.input, s.input]} textAlignVertical="top" accessibilityLabel="招呼内容" />
    <Text style={[ui.muted, tooLong && s.over]}>{codePoints(greeting)} / {GREETING_MAX}</Text>
    <Notice message={!fix ? '需要先确认你在现场。' : ''} />
    <Notice tone="error" message={error} />
    {empty && <Notice message="演示权益已用完。" actionLabel="去「演示与模拟」领取" onAction={() => { onClose(); router.push('/settings/demo'); }} />}
    <Action title={busy ? '正在发送…' : '发送申请'} disabled={busy || !fix || !length || tooLong || empty} onPress={() => { submit(); }} />
  </Sheet>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  input: { minHeight: 90, backgroundColor: colors.raised },
  over: { color: colors.danger },
});
