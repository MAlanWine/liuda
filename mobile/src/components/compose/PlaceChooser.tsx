import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PositionEvidence, PostSummary } from '../../api';
import { gate } from '../../domain/gate';
import { colors, ui } from '../ui';

export type Scene = { sceneId: string; name: string; distanceLabel: string; count: number; point: { latitude: number; longitude: number } };

/**
 * Existing scenes the caller may add to: full-tier nearby posts whose point passes the on-site gate now, one row per
 * `sceneId`. `fresh` comes from `usePosition()` (the gate is evaluated at the fix's own time, freshness separately).
 */
export function onsiteScenes(posts: PostSummary[], fix: PositionEvidence | null, fresh: boolean): Scene[] {
  if (!fix || !fresh) return [];
  const scenes = new Map<string, Scene & { onsite: boolean }>();
  for (const post of posts) {
    if (post.level !== 'full') continue;
    const onsite = gate(fix, post, fix.timestamp).ok;
    const existing = scenes.get(post.sceneId);
    if (existing) {
      existing.count += 1;
      if (onsite && !existing.onsite) Object.assign(existing, { onsite, distanceLabel: post.distanceLabel, point: { latitude: post.latitude, longitude: post.longitude } });
      continue;
    }
    scenes.set(post.sceneId, { sceneId: post.sceneId, name: post.name, distanceLabel: post.distanceLabel, count: 1, onsite, point: { latitude: post.latitude, longitude: post.longitude } });
  }
  return [...scenes.values()].filter(scene => scene.onsite).map(({ sceneId, name, distanceLabel, count, point }) => ({ sceneId, name, distanceLabel, count, point }));
}

/**
 * Optional: leave the post at an existing nearby place (same `sceneId`) instead of a new one at the current point.
 * Collapsed by default; shows a warning when the chosen place is no longer within the on-site range.
 */
export function PlaceChooser({ scenes, selectedSceneId, selectedName, onSelect, disabled = false }: {
  scenes: Scene[]; selectedSceneId: string | null; selectedName: string; onSelect(scene: Scene | null): void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedMissing = selectedSceneId != null && !scenes.some(scene => scene.sceneId === selectedSceneId);
  if (!scenes.length && !selectedSceneId) return null;
  return <View style={s.box}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} disabled={disabled} onPress={() => setOpen(value => !value)} style={s.toggle}>
      <Text style={s.toggleText}>{selectedSceneId ? `留在已有地点：${selectedName || '已选地点'}` : `附近有 ${scenes.length} 个已有地点，可以选一个（选填）`}</Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
    </Pressable>
    {selectedMissing ? <Text style={s.warn} accessibilityLiveRegion="polite">已离开所选地点的到场范围，可以走近一些，或改为新地点。</Text> : null}
    {open ? <View style={s.list}>
      <Row label="新地点（当前位置）" detail="用上面的地点名新建一处" selected={selectedSceneId == null} disabled={disabled} onPress={() => { onSelect(null); setOpen(false); }} />
      {scenes.map(scene => <Row key={scene.sceneId} label={scene.name} detail={`${scene.distanceLabel} · ${scene.count} 条留话`}
        selected={scene.sceneId === selectedSceneId} disabled={disabled} onPress={() => { onSelect(scene); setOpen(false); }} />)}
    </View> : null}
  </View>;
}

function Row({ label, detail, selected, disabled, onPress }: { label: string; detail: string; selected: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected, disabled }} accessibilityLabel={`${label}，${detail}`} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.row, selected && s.selected, pressed && ui.pressed]}>
    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? colors.accent : colors.muted} />
    <View style={s.rowText}>
      <Text style={s.rowLabel} numberOfLines={1}>{label}</Text>
      <Text style={ui.muted} numberOfLines={1}>{detail}</Text>
    </View>
  </Pressable>;
}

const s = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4, gap: 4 },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  toggleText: { color: colors.text, fontSize: 14, flexShrink: 1 },
  warn: { color: colors.subtle, fontSize: 13, lineHeight: 21 },
  list: { gap: 6, paddingBottom: 8 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.raised },
  selected: { borderWidth: 1, borderColor: colors.accent },
  rowText: { flex: 1 },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
