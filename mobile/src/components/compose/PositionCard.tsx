import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MAX_ACCURACY } from '../../domain/gate';
import type { PositionDescription } from '../../location/device';
import { permissionMessage } from '../../location/permission';
import { usePosition } from '../../state/position';
import { PermissionHelp } from '../common/PermissionHelp';
import { PositionModeChip } from '../common/PositionModeChip';
import RealPlaceMap from '../RealPlaceMap';
import { colors, ui } from '../ui';

/** Readable place line from a reverse-geocode result (landmark first). */
export function describeLine(description: PositionDescription | null | undefined): string {
  if (!description) return '';
  return [description.landmark, description.area || description.address].filter(Boolean).join(' · ');
}

/**
 * Where the post will be left: source (真实定位 / 模拟位置 chip), accuracy, freshness, reverse-geocoded place,
 * a small map, and `PermissionHelp` (denied -> settings, approximate -> 精确位置 guidance, 模拟位置 offer).
 */
export function PositionCard({ description }: { description: PositionDescription | null }) {
  const { mode, fix, fresh, permission, tracking, notice, refresh } = usePosition();
  const [refreshing, setRefreshing] = useState(false);
  const simulated = mode === 'simulated';
  const place = describeLine(description);
  const weak = !simulated && fix != null && (fix.accuracy == null || fix.accuracy > MAX_ACCURACY);

  async function onRefresh() {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  }

  const status = !fix
    ? (simulated ? '正在设置模拟位置…' : permission === 'granted' && tracking ? '正在定位…' : '等待获取位置')
    : simulated
      ? '模拟位置 · 不读取 GPS'
      : !fresh
        ? '位置已过期，正在刷新…'
        : `精度约 ${fix.accuracy != null ? Math.round(fix.accuracy) : '—'} 米 · 刚刚更新`;

  return <View style={s.card}>
    <View style={s.row}>
      <Ionicons name="location-outline" size={20} color={colors.accent} />
      <View style={s.text}>
        <Text style={s.title}>当前位置</Text>
        <Text style={ui.muted} numberOfLines={2}>{fix ? place || '已定位，正在识别地名…' : '还没有位置'}</Text>
        <Text style={[ui.muted, !simulated && fix && !fresh ? s.warn : null]} accessibilityLiveRegion="polite">{status}</Text>
      </View>
      <PositionModeChip />
    </View>
    {weak ? <Text style={s.warn} accessibilityLiveRegion="polite">定位精度需在 {MAX_ACCURACY} 米以内才能留话。可以走到开阔处，或稍等片刻。</Text> : null}
    {/* PermissionHelp (below) already explains approximate location; don't repeat it. */}
    {notice && notice !== permissionMessage(permission) ? <Text style={ui.muted}>{notice}</Text> : null}
    {fix ? <RealPlaceMap point={fix} fix={fix} currentOnly /> : null}
    <PermissionHelp showSimulated />
    {!simulated && permission === 'granted' ? <Pressable accessibilityRole="button" accessibilityLabel="刷新当前位置" disabled={refreshing} onPress={onRefresh}
      style={({ pressed }) => [s.refresh, refreshing && ui.disabled, pressed && ui.pressed]}>
      <Text style={s.refreshText}>{refreshing ? '正在刷新…' : '刷新位置'}</Text>
    </Pressable> : null}
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  text: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 14, fontWeight: '600' },
  warn: { color: colors.subtle, fontSize: 13, lineHeight: 21 },
  refresh: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 4 },
  refreshText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
});
