import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, describeError, isApiError, type PositionEvidence } from '../../api';
import { exclusive } from '../../domain/attempt';
import { checkPosition, gate } from '../../domain/gate';
import { newRequestId } from '../../domain/ids';
import { CLUE_MAX, codePoints, NAME_MAX, shortenName, TEXT_MAX } from '../../domain/text';
import { describePosition, type PositionDescription } from '../../location/device';
import { publishPost, type PublishStep } from '../../state/actions';
import { useDraft, type Draft } from '../../state/draft';
import { useNearby } from '../../state/nearby';
import { usePosition, useSignificantFix, useTrackWhileFocused } from '../../state/position';
import { Notice } from '../../components/common/Notice';
import { AlignedTextInput, KeyboardAlignedScrollView } from '../../components/KeyboardAlignedScrollView';
import { PlaceChooser, onsiteScenes, type Scene } from '../../components/compose/PlaceChooser';
import { PhotoCapture } from '../../components/compose/PhotoCapture';
import { PositionCard } from '../../components/compose/PositionCard';
import { compressPhoto, decodedBytes, PHOTO_MAX_BYTES } from '../../components/compose/photo';
import { Action, colors, Screen, tabBarHeight, ui } from '../../components/ui';

const STEPS = ['确认位置', '处理照片', '提交'] as const;
const PUBLISH_STEP: Record<PublishStep, number> = { presence: 0, photo: 1, post: 2 };
type Progress = { step: number; failed: boolean } | null;

/** Cuts to `max` code points (emoji count as one) without touching shorter input (keeps IME composition intact). */
function clip(value: string, max: number) {
  return codePoints(value) > max ? Array.from(value).slice(0, max).join('') : value;
}

/**
 * Name suggested by reverse geocoding (D-14: this is what gets saved unless the user edits it), shortened at a word /
 * segment boundary. The system geocoder answers in the phone's language (expo-location takes no locale), so a phone set
 * to English gets English names; the dev `/api/place-name` route (AMap) is Chinese.
 */
function suggestedName(description: PositionDescription | null) {
  const value = (description?.landmark || description?.area || description?.address || '').trim();
  return shortenName(value, NAME_MAX);
}

export default function LeaveScreen() {
  useTrackWhileFocused();
  const position = usePosition();
  const { posts } = useNearby();
  const { draft, update, clear, restored } = useDraft();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [frameBottom, setFrameBottom] = useState<number | null>(null);
  // The reverse-geocoded name belongs to the fix it was asked for: switching 真实定位 ⇄ 模拟位置 never shows the other mode's name.
  const [described, setDescribed] = useState<{ source: PositionEvidence['source']; value: PositionDescription | null } | null>(null);
  // 'auto' = the name follows the reverse-geocoded place; 'user' = typed or picked, kept as is.
  const [nameSource, setNameSource] = useState<'auto' | 'user'>(() => (draft.name || draft.sceneId ? 'user' : 'auto'));
  const [clueOpen, setClueOpen] = useState(() => !!draft.clue);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);

  // A stored draft arrived (app restart / account switch): resync what this screen derives from it.
  const [syncedRestore, setSyncedRestore] = useState(restored);
  if (syncedRestore !== restored) {
    setSyncedRestore(restored);
    setNameSource(draft.name || draft.sceneId ? 'user' : 'auto');
    setClueOpen(!!draft.clue);
  }

  // A restored photo is stored as its file only: re-encode it, or drop it if the file is gone. The requestId stays: if an
  // earlier attempt of this draft already reached the server, it answers REQUEST_CONFLICT (new id on retry), never a second post.
  const restoredPhoto = draft.photo && !draft.photo.base64 ? draft.photo : null;
  useEffect(() => {
    if (!restoredPhoto) return;
    let active = true;
    compressPhoto(restoredPhoto.uri, restoredPhoto.simulated)
      .then(photo => { if (active) update({ photo }); })
      .catch(() => { if (active) { update({ photo: null }); setNotice('上次草稿里的照片已失效，请重新拍摄。'); } });
    return () => { active = false; };
  }, [restoredPhoto, update]);

  const geoFix = useSignificantFix(30);
  useEffect(() => {
    if (!geoFix) return;
    let active = true;
    const source = geoFix.source;
    describePosition(geoFix)
      .then(value => { if (active) setDescribed(prev => value || prev?.source !== source ? { source, value } : prev); })
      .catch(() => { if (active) setDescribed(prev => prev?.source === source ? prev : { source, value: null }); });
    return () => { active = false; };
  }, [geoFix]);
  const description = described && geoFix && described.source === geoFix.source ? described.value : null;

  const scenes = useMemo(() => onsiteScenes(posts, position.fix, position.fresh), [posts, position.fix, position.fresh]);
  const suggestion = suggestedName(description);
  const name = nameSource === 'auto' && !draft.sceneId ? suggestion : draft.name;
  const textLength = codePoints(draft.text.trim());
  const nameLength = codePoints(name.trim());
  const clueLength = codePoints(draft.clue.trim());
  const ready = !restoredPhoto && !!position.fix && textLength >= 1 && textLength <= TEXT_MAX && nameLength >= 1 && nameLength <= NAME_MAX && clueLength <= CLUE_MAX;
  const hint = !position.fix ? '先获取位置' : textLength < 1 ? '写一句话后就能留下' : nameLength < 1 ? '给这个地点起个名字' : '';
  const hasDraft = !!(draft.text || draft.clue || draft.photo || draft.sceneId || (nameSource === 'user' && draft.name));

  // D-10: RN measures the KAV frame in its parent. The KAV's window bottom is the tab bar's top
  // (window height - tabBarHeight(insets)); the offset is that minus the measured bottom, so the padding equals the
  // keyboard's overlap with the screen above the tab bar and the 留在这里 button sits right above the keyboard.
  const keyboardOffset = frameBottom == null ? 0 : windowHeight - tabBarHeight(insets) - frameBottom;

  /**
   * A content edit makes a new body, so it gets a new requestId right away (minted here, not at tap time): every tap and
   * retry of this body then sends the same id — a double tap can never publish twice.
   */
  function edit(patch: Partial<Draft>) {
    update({ ...patch, requestId: newRequestId() });
    setNotice('');
    if (progress?.failed) setProgress(null);
  }

  function chooseScene(scene: Scene | null) {
    if (scene) { setNameSource('user'); edit({ sceneId: scene.sceneId, name: scene.name }); }
    else { setNameSource('auto'); edit({ sceneId: null, name: '' }); }
  }

  function confirmClear() {
    Alert.alert('清空草稿？', '文字、地点名、线索和照片都会清除，无法恢复。', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: () => { clear(); setNameSource('auto'); setClueOpen(false); setNotice(''); setProgress(null); } },
    ]);
  }

  function submit() {
    // Synchronous in-flight guard: a second tap in the same frame (before `busy` renders) is dropped.
    return exclusive(inFlight, publish);
  }

  async function publish() {
    if (busy || !ready) return;
    setBusy(true);
    setNotice('');
    let step = 0;
    setProgress({ step, failed: false });
    const requestId = draft.requestId ?? newRequestId();
    if (!draft.requestId) update({ requestId });
    try {
      // 1. 确认位置
      let pos = position.fix;
      if (position.mode === 'gps' && (!pos || !position.fresh)) pos = await position.refresh();
      const checked = checkPosition(pos, Date.now());
      if (!pos) throw new ApiError('LOCATION_REQUIRED', '还没有拿到位置，请先允许定位或改用模拟位置。');
      if (!checked.ok) throw new ApiError(checked.code, checked.message);
      if (draft.sceneId) {
        const base = posts.find(post => post.sceneId === draft.sceneId && post.level === 'full');
        const onScene = base ? gate(pos, base, Date.now()) : null;
        if (!onScene) throw new ApiError('NOT_ONSITE', '已离开所选地点的到场范围，可以走近一些，或改为新地点。');
        if (!onScene.ok) throw new ApiError(onScene.code, onScene.message);
      }
      const photo = draft.photo;
      if (photo && decodedBytes(photo.base64) > PHOTO_MAX_BYTES) { step = 1; throw new ApiError('PHOTO_SIZE'); }
      // Server side: 确认位置 (presence) → 处理照片 (upload, if any) → 提交 (presence `post` + post); same requestId on every retry of this draft.
      const result = await publishPost({
        text: draft.text.trim(), name: name.trim(),
        ...draft.clue.trim() ? { clue: draft.clue.trim() } : {},
        ...draft.sceneId ? { sceneId: draft.sceneId } : {},
        ...photo ? { photoBase64: photo.base64 } : {},
      }, pos, requestId, next => {
        step = PUBLISH_STEP[next];
        setProgress({ step, failed: false });
      }, position.freshFix);
      clear();
      setNameSource('auto');
      setClueOpen(false);
      setProgress(null);
      router.push({ pathname: '/posted/[id]', params: { id: result.id, name: name.trim() } });
    } catch (error) {
      if (isApiError(error) && error.code === 'REQUEST_CONFLICT') update({ requestId: newRequestId() });
      setProgress({ step, failed: true });
      setNotice(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  return <Screen>
    <KeyboardAvoidingView style={s.flex} behavior="padding" keyboardVerticalOffset={keyboardOffset}
      onLayout={event => { const { y, height } = event.nativeEvent.layout; setFrameBottom(y + height); }}>
      <KeyboardAlignedScrollView contentContainerStyle={s.content} keyboardDismissMode="interactive">
        <View style={s.titleRow}>
          <Text accessibilityRole="header" style={[ui.title, s.flex]}>想在这里留句话？</Text>
          {hasDraft ? <Pressable accessibilityRole="button" accessibilityLabel="清空草稿" disabled={busy} hitSlop={8} onPress={confirmClear} style={({ pressed }) => [s.clear, pressed && ui.pressed]}>
            <Text style={s.clearText}>清空草稿</Text>
          </Pressable> : null}
        </View>

        <PositionCard description={description} />

        <PlaceChooser scenes={scenes} selectedSceneId={draft.sceneId} selectedName={draft.name} onSelect={chooseScene} disabled={busy} />

        <View>
          <Text style={ui.label}>地点名</Text>
          <AlignedTextInput value={name} editable={!busy && !draft.sceneId}
            onChangeText={value => { setNameSource('user'); edit({ name: clip(value, NAME_MAX) }); }}
            placeholder="例如：西门梧桐树下、三号楼侧门" placeholderTextColor={colors.muted} style={[ui.input, draft.sceneId ? s.locked : null]} accessibilityLabel="地点名" returnKeyType="next" />
          <View style={s.metaRow}>
            <Text style={ui.muted}>{draft.sceneId ? '使用已有地点的名字' : nameSource === 'auto' && suggestion ? '已按当前位置填写，可以修改' : ' '}</Text>
            <Text style={ui.muted}>{nameLength} / {NAME_MAX}</Text>
          </View>
          {nameSource === 'user' && !draft.sceneId && suggestion && suggestion !== draft.name ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setNameSource('auto'); edit({ name: '' }); }} style={s.linkButton}>
            <Text style={s.linkText} numberOfLines={1}>改用定位地名「{suggestion}」</Text>
          </Pressable> : null}
        </View>

        <View>
          <AlignedTextInput value={draft.text} editable={!busy} multiline onChangeText={value => edit({ text: clip(value, TEXT_MAX) })}
            placeholder="一个吐槽、提醒，或者一句玩笑……" placeholderTextColor={colors.muted} style={[ui.input, s.textArea]} textAlignVertical="top" accessibilityLabel="留话内容" />
          <Text style={[ui.muted, s.count]}>{textLength} / {TEXT_MAX}</Text>
        </View>

        <View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: clueOpen }} onPress={() => setClueOpen(open => !open)} style={s.linkButton}>
            <Text style={ui.muted}>{clueOpen ? '收起现场线索' : '＋ 补充现场线索（选填）'}</Text>
          </Pressable>
          {clueOpen ? <>
            <AlignedTextInput value={draft.clue} editable={!busy} onChangeText={value => edit({ clue: clip(value, CLUE_MAX) })}
              placeholder="例如：进西门右转，梧桐树下" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="现场线索（选填）" />
            <Text style={[ui.muted, s.count]}>{clueLength} / {CLUE_MAX}</Text>
          </> : null}
        </View>

        <PhotoCapture photo={draft.photo} disabled={busy} onChange={photo => edit({ photo })} />

        <Text style={ui.muted}>留话内容会经过演示审核。留下后，离开现场也能在「消息」里继续看回应。</Text>
      </KeyboardAlignedScrollView>

      <View style={s.footer}>
        {progress ? <Steps progress={progress} hasPhoto={!!draft.photo} /> : null}
        <Notice message={notice} tone="error" />
        <Action title={busy ? '正在留下…' : progress?.failed ? '重试' : '留在这里'} disabled={busy || !ready} onPress={() => { submit(); }} />
        {!busy && hint ? <Text style={[ui.muted, s.hint]}>{hint}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  </Screen>;
}

function Steps({ progress, hasPhoto }: { progress: NonNullable<Progress>; hasPhoto: boolean }) {
  return <View style={s.steps} accessible accessibilityLabel={`进度：${STEPS[progress.step]}${progress.failed ? '失败' : '中'}`}>
    {STEPS.map((label, index) => {
      const done = index < progress.step;
      const current = index === progress.step;
      const failed = current && progress.failed;
      return <View key={label} style={s.step}>
        {current && !failed ? <ActivityIndicator size="small" color={colors.accent} />
          : <Ionicons name={failed ? 'alert-circle' : done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={failed ? colors.danger : done ? colors.accent : colors.muted} />}
        <Text style={[s.stepText, (done || current) && s.stepActive, failed && s.stepFailed]}>{index === 1 && !hasPhoto ? '无照片' : label}</Text>
      </View>;
    })}
  </View>;
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24, gap: 18, paddingBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  clear: { minHeight: 44, justifyContent: 'center' },
  clearText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  locked: { opacity: 0.7 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 12 },
  linkButton: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.accent, fontSize: 13 },
  textArea: { minHeight: 150 },
  count: { textAlign: 'right', marginTop: 8 },
  footer: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.background },
  hint: { textAlign: 'center' },
  steps: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepText: { color: colors.muted, fontSize: 13 },
  stepActive: { color: colors.text },
  stepFailed: { color: colors.danger },
});
