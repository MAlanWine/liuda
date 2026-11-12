import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import type { PostSummary } from '../api';
import { toMapCoordinate } from '../domain/crs';
import { distanceMeters } from '../domain/geo';
import { permissionMessage } from '../location/permission';
import { usePosition } from '../state/position';
import { PermissionHelp } from './common/PermissionHelp';
import { PositionModeChip } from './common/PositionModeChip';
import { Notice } from './common/Notice';
import { StreetViewPreview } from './StreetViewPreview';
import RealPlaceMap from './RealPlaceMap';
import { Action, colors, ui } from './ui';

/**
 * Position block of the place detail: mode chip, interactive map, distance, accuracy and the global position notice
 * (stale GPS shows 位置已过期，正在刷新…, never cleared). Reads the one global position (`usePosition()`); GPS
 * tracking itself is requested by the screen via `useTrackWhileFocused` (`tracking` says whether it wants it).
 * In 模拟位置: 模拟走近 (120 m, preview) / 模拟到场 (8 m, full). Otherwise 我在现场，更新位置 calls `onRequestUpdate`.
 */
export function LivePlacePosition({ post, onsite, tracking, onRequestUpdate }: {
  post: PostSummary; onsite: boolean; tracking: boolean; onRequestUpdate: () => Promise<void>;
}) {
  const { mode, fix, fresh, notice, permission, simulateNear } = usePosition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const simulated = mode === 'simulated';
  const distance = fix ? Math.round(distanceMeters(fix, post)) : null;
  const known = distance !== null && Number.isFinite(distance);

  async function update() {
    setBusy(true);
    setError('');
    try { await onRequestUpdate(); }
    finally { setBusy(false); }
  }

  async function directions() {
    const target = toMapCoordinate(post);
    const destination = encodeURIComponent(`${target.latitude},${target.longitude}`);
    const url = Platform.OS === 'ios'
      ? `https://maps.apple.com/?daddr=${destination}&dirflg=w`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=walking`;
    try { await Linking.openURL(url); }
    catch { setError('无法打开地图，请稍后重试。'); }
  }

  const staleIdle = !simulated && !!fix && !fresh && !tracking;
  const status = known ? `直线约 ${distance} 米${onsite ? ' · 已到场' : ''}` : simulated ? '模拟位置尚未设置' : '定位后查看距离';

  return (
    <View style={s.box}>
      <View style={s.row}>
        <Text style={[ui.body, s.flex]} accessibilityLiveRegion="polite">{status}</Text>
        <PositionModeChip />
      </View>
      <RealPlaceMap point={post} fix={fix} />
      {!simulated && fix?.accuracy != null && <Text style={ui.muted}>定位精度约 {Math.round(fix.accuracy)} 米{fresh ? '' : ' · 不是最新位置'}</Text>}
      {/* PermissionHelp (below) already explains approximate location; don't repeat it. */}
      <Notice message={(tracking || simulated) && notice === permissionMessage(permission) ? '' : notice} />
      <Notice message={staleIdle ? '位置不是最新的。到场后点「我在现场，更新位置」。' : ''} />
      <Notice tone="error" message={error} />
      {(tracking || simulated) && <PermissionHelp showSimulated />}
      {simulated
        ? <View style={s.actions}>
            <View style={s.flex}><Action secondary title="模拟走近" onPress={() => simulateNear(post, 120)} /></View>
            <View style={s.flex}><Action secondary title="模拟到场" disabled={onsite} onPress={() => simulateNear(post, 8)} /></View>
          </View>
        : !onsite && <Action title={busy ? '正在定位…' : '我在现场，更新位置'} disabled={busy} onPress={update} />}
      <Action secondary title="打开步行路线" onPress={directions} />
      {simulated && <Text style={[ui.muted, s.demo]}>模拟位置只在本机演示中使用，不会读取或改变你的真实位置。</Text>}
      {__DEV__ && <StreetViewPreview key={`${post.latitude},${post.longitude}`} point={post} />}
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  demo: { color: colors.demo },
});
