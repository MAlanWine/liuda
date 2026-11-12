import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AlignedTextInput, KeyboardAlignedScrollView } from '../../components/KeyboardAlignedScrollView';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useProfile } from '../../state/profile';
import { normalizeProfile } from '../../state/profile-data';
import { Avatar } from '../../components/Avatar';
import { Action, colors, Loading, ui } from '../../components/ui';

class PhotoError extends Error {}

export default function EditProfileScreen() {
  const store = useProfile();
  if (!store.ready) return <Loading />;
  return <ProfileEditor />;
}
function ProfileEditor() {
  const { profile, save } = useProfile();
  const [nickname, setNickname] = useState(profile.nickname);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [busy, setBusy] = useState<'image' | 'save' | null>(null);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const nameLength = Array.from(nickname.trim()).length;
  const valid = nameLength > 0 && nameLength <= 16 && !/[\u0000-\u001f\u007f-\u009f]/u.test(nickname);
  const changed = nickname.trim() !== profile.nickname || avatar !== profile.avatar;
  function back() { if (router.canGoBack()) router.back(); else router.replace('/me'); }
  async function chooseAvatar() {
    if (busy) return;
    setError('');
    let processing = false;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1, exif: false });
      if (!mounted.current || result.canceled) return;
      processing = true; setBusy('image');
      const asset = result.assets[0];
      if (!asset || asset.width <= 0 || asset.height <= 0) throw new PhotoError('无法读取这张图片，请换一张试试。');
      if (asset.fileSize && asset.fileSize > 15 * 1024 * 1024) throw new PhotoError('请选择 15MB 以内的图片。');
      const side = Math.min(asset.width, asset.height);
      const context = ImageManipulator.manipulate(asset.uri);
      const image = await context.crop({ originX: Math.floor((asset.width - side) / 2), originY: Math.floor((asset.height - side) / 2), width: side, height: side }).resize({ width: 320, height: 320 }).renderAsync();
      const output = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
      if (!output.base64) throw new PhotoError('图片处理失败，请重新选择。');
      const next = `data:image/jpeg;base64,${output.base64}`;
      normalizeProfile({ nickname: '头像预览', avatar: next });
      if (mounted.current) setAvatar(next);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof PhotoError ? cause.message : '无法读取照片，请检查照片访问权限，或换一张图片再试。');
    } finally { if (processing && mounted.current) setBusy(null); }
  }
  async function submit() {
    if (!valid || busy || !changed) return;
    setBusy('save'); setError('');
    try {
      await save({ nickname, avatar });
      if (mounted.current) back();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '资料未保存，请稍后重试。');
    } finally { if (mounted.current) setBusy(null); }
  }
  return <KeyboardAlignedScrollView style={ui.screen} contentContainerStyle={s.content}>
      <View style={s.avatarBlock}>
        <Pressable accessibilityRole="button" accessibilityLabel="选择头像照片" disabled={busy !== null} onPress={chooseAvatar} style={s.avatarButton}><Avatar uri={avatar} size={98} /><View style={s.camera}><Ionicons name="camera-outline" size={17} color="#141b11" /></View></Pressable>
        <Pressable accessibilityRole="button" disabled={busy !== null} onPress={chooseAvatar} style={s.choose}><Text style={s.chooseText}>{busy === 'image' ? '正在处理图片…' : '选择照片'}</Text></Pressable>
        {avatar && <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => { setAvatar(null); setError(''); }} hitSlop={10}><Text style={s.restore}>恢复默认头像</Text></Pressable>}
      </View>
      <View><Text style={s.label}>昵称</Text><AlignedTextInput value={nickname} onChangeText={setNickname} maxLength={32} editable={busy !== 'save'} placeholder="你想被怎么称呼？" placeholderTextColor={colors.muted} accessibilityLabel="我的昵称" style={s.input} autoCorrect={false} returnKeyType="done" />
        <View style={s.hintRow}><Text style={s.hint}>可以重名，1–16 个字</Text><Text style={[s.hint, nameLength > 16 && { color: '#e4a5a5' }]}>{nameLength} / 16</Text></View>
      </View>
      <View style={s.note}><Ionicons name="eye-off-outline" color="#9fae94" size={18} /><Text style={s.noteText}>头像和昵称会出现在你的留话与接话中。你的完整留言历史和活动地点不对他人公开。</Text></View>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <Action title={busy === 'save' ? '正在保存…' : '保存资料'} disabled={!valid || busy !== null || !changed} onPress={submit} />
      <Action secondary title="取消" disabled={busy !== null} onPress={back} />
      <Text style={s.footnote}>当前资料仅保存在这台设备，换机暂不能恢复。照片会居中裁为方形；修改后点击保存才会生效。</Text>
    </KeyboardAlignedScrollView>;
}
const s = StyleSheet.create({
  content: { padding: 24, gap: 20, paddingBottom: 44 },
  avatarBlock: { alignItems: 'center', paddingTop: 13, paddingBottom: 12, gap: 8 },
  avatarButton: { width: 98, height: 98 },
  camera: { position: 'absolute', bottom: -1, right: -1, backgroundColor: colors.accent, width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: colors.background },
  choose: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 20 },
  chooseText: { fontSize: 13, color: '#d3dfc8' },
  restore: { fontSize: 11, color: colors.muted, lineHeight: 20 },
  label: { color: '#dce2d4', fontSize: 14, marginBottom: 12 },
  input: { color: colors.text, backgroundColor: '#1c201c', borderRadius: 15, paddingLeft: 17, paddingRight: 28, paddingVertical: 18, fontSize: 17, minHeight: 60, includeFontPadding: true },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  hint: { color: '#929b8b', fontSize: 11, lineHeight: 20 },
  note: { flexDirection: 'row', gap: 11, paddingVertical: 10 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 23, color: '#929d89' },
  error: { color: '#e4abab', fontSize: 13, lineHeight: 22 },
  footnote: { color: '#81897b', fontSize: 11, lineHeight: 21, textAlign: 'center' },
});
