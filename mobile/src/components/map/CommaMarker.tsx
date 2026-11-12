import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import type { MarkerGroup } from '../../domain/cluster';
import { toMapCoordinate } from '../../domain/crs';
import { colors } from '../ui';

/** Visible size (pt) per heat tier: 普通 / 有回应 / 热门 (docs/map-heat-and-clusters.md). */
export const MARKER_SIZE = { 1: 22, 2: 26, 3: 30 } as const;
const comma = require('../../../assets/liuda-comma.png');

/**
 * Comma marker for one group: the logo PNG as-is (never recoloured), sized by the hottest member's tier,
 * count badge for groups (`9+` above nine), outline when the selected post is in the group.
 * `tracksViewChanges` stays on only until the image has loaded and laid out (and briefly after a visual change).
 */
export function CommaMarker({ group, onPress }: { group: MarkerGroup; onPress: (group: MarkerGroup) => void }) {
  const size = MARKER_SIZE[group.tier];
  const look = `${group.tier}:${group.countLabel}:${group.active ? 1 : 0}`;
  const [tracking, setTracking] = useState({ look, on: true, loaded: false, laidOut: false });
  if (tracking.look !== look) setTracking(t => ({ ...t, look, on: true }));
  const settled = tracking.loaded && tracking.laidOut;
  useEffect(() => {
    if (!tracking.on || !settled) return;
    const timer = setTimeout(() => setTracking(t => ({ ...t, on: false })), 250);
    return () => clearTimeout(timer);
  }, [tracking.on, settled]);

  const label = group.count > 1 ? `${group.name}，${group.count} 条留话，${group.heatLabel}` : `${group.name}，${group.heatLabel}`;
  return <Marker coordinate={toMapCoordinate(group)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracking.on}
    zIndex={group.active ? 3 : group.tier} onPress={() => onPress(group)} accessibilityLabel={label}>
    <View style={s.hit} onLayout={() => setTracking(t => t.laidOut ? t : { ...t, laidOut: true })}>
      <View style={[s.ring, { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 }, group.active && s.active]}>
        <Image source={comma} accessible={false} onLoadEnd={() => setTracking(t => t.loaded ? t : { ...t, loaded: true })}
          style={{ width: size, height: size, borderRadius: size / 2 }} />
      </View>
      {group.count > 1 && <View style={s.badge}><Text style={s.badgeText}>{group.countLabel}</Text></View>}
    </View>
  </Marker>;
}
const s = StyleSheet.create({
  hit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ring: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.black, backgroundColor: colors.black },
  active: { borderColor: colors.text },
  badge: { position: 'absolute', top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.black },
  badgeText: { color: colors.onAccent, fontSize: 10, fontWeight: '700' },
});
