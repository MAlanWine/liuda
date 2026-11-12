import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { openAppSettings } from '../../location/permission';
import { DemoBadge } from '../common/DemoBadge';
import { Notice } from '../common/Notice';
import { colors, ui } from '../ui';
import { cameraAvailable, capturePhoto, demoPhoto, PhotoTooLargeError, type CapturedPhoto } from './photo';

/**
 * Optional on-site photo (rule 3: in-app camera only, no album). Shows a preview with 重拍 / 移除.
 * When the camera is unavailable (iOS simulator) it offers 使用演示照片（模拟拍摄）, marked 模拟拍摄.
 */
export function PhotoCapture({ photo, onChange, disabled = false }: {
  photo: CapturedPhoto | null; onChange(photo: CapturedPhoto | null): void; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);
  // No camera (iOS simulator): never launch it — offer the 演示照片 path from the start.
  const [unavailable, setUnavailable] = useState(() => !cameraAvailable());

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    try {
      await task();
    } catch (error) {
      setNotice(error instanceof PhotoTooLargeError ? error.message : '照片处理失败，请重新拍摄。');
    } finally {
      setBusy(false);
    }
  }

  const shoot = () => run(async () => {
    const result = await capturePhoto();
    setDenied(result.kind === 'denied');
    if (result.kind === 'ok') { setUnavailable(false); onChange(result.photo); }
    else if (result.kind === 'unavailable') { setUnavailable(true); setNotice('这台设备无法打开相机（模拟器没有相机）。'); }
    else if (result.kind === 'denied') setNotice(result.canAskAgain ? '需要相机权限才能拍摄现场照片。' : '相机权限已关闭，可在系统设置中开启。');
  });
  const pickDemo = () => run(async () => { onChange(await demoPhoto()); });
  const locked = disabled || busy;

  return <View style={s.box}>
    <View style={s.header}>
      <Text style={s.title}>现场照片（选填）</Text>
      {busy ? <ActivityIndicator color={colors.accent} accessibilityLabel="正在处理照片" /> : null}
    </View>
    {unavailable && !photo ? <Text style={ui.muted}>这台设备没有可用的相机（模拟器），可以用演示照片代替。</Text> : null}
    {photo ? <View style={s.previewWrap}>
      <Image source={{ uri: photo.uri }} style={s.preview} resizeMode="cover" accessibilityLabel={photo.simulated ? '演示照片预览' : '现场照片预览'} />
      {photo.simulated ? <View style={s.badge}><DemoBadge label="模拟拍摄" /></View> : null}
      <View style={s.row}>
        <SmallButton icon="camera-outline" label={unavailable ? '换一张演示照片' : '重拍'} disabled={locked} onPress={unavailable ? pickDemo : shoot} />
        <SmallButton icon="trash-outline" label="移除" disabled={locked} onPress={() => onChange(null)} danger />
      </View>
    </View> : <View style={s.row}>
      {unavailable ? null : <SmallButton icon="camera-outline" label="拍一张现场照片" disabled={locked} onPress={shoot} />}
      {unavailable ? <SmallButton icon="image-outline" label="使用演示照片（模拟拍摄）" disabled={locked} onPress={pickDemo} /> : null}
    </View>}
    <Notice message={notice} tone="error" actionLabel={denied ? '去设置开启' : undefined} onAction={denied ? () => { openAppSettings(); } : undefined} />
    <Text style={ui.muted}>只能用相机现场拍摄，不从相册选择。照片会压缩到 512KB 以内。</Text>
  </View>;
}

function SmallButton({ icon, label, onPress, disabled, danger = false }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress(): void; disabled: boolean; danger?: boolean;
}) {
  const tint = danger ? colors.danger : colors.accent;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, disabled && ui.disabled, pressed && ui.pressed]}>
    <Ionicons name={icon} size={18} color={tint} />
    <Text style={[s.buttonText, { color: tint }]}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 14, fontWeight: '600' },
  previewWrap: { gap: 8 },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: colors.raised },
  badge: { position: 'absolute', top: 8, left: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.raised },
  buttonText: { fontSize: 14, fontWeight: '600' },
});
