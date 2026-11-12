import { useEffect, useState, type ComponentType } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { distanceMeters } from '../domain/geo';
import { devApiUrl } from '../location/api';
import { nativeMapsAvailable } from './map/nativeMaps';
import type { RealPlaceMapProps } from './RealPlaceMap';
import { colors } from './ui';

// Loaded lazily on purpose: AppleRealPlaceMap imports react-native-maps, which crashes Expo Go at module load.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AppleRealPlaceMap: ComponentType<RealPlaceMapProps> | null = nativeMapsAvailable ? require('./AppleRealPlaceMap').default : null;

/** Development build: interactive Apple Maps. Expo Go: Amap static base map from the dev server (key stays server-side). */
export default function RealPlaceMap(props: RealPlaceMapProps) {
  return AppleRealPlaceMap ? <AppleRealPlaceMap {...props} /> : <StaticPlaceMap {...props} />;
}

type SnapshotResult = { status?: string; image?: string };

// RN 0.88's types dropped StyleSheet.absoluteFillObject; this is the spreadable equivalent.
const absoluteFill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/** ~11 m grid: a new static map only when the centre really moved, not on every GPS reading. */
const gridKey = (value: number) => value.toFixed(4);

function StaticPlaceMap({ point, fix, currentOnly = false }: RealPlaceMapProps) {
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const center = fix ?? point;
  const latKey = gridKey(center.latitude), lonKey = gridKey(center.longitude);

  useEffect(() => {
    const url = devApiUrl('/api/static-map');
    let active = true;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: Number(latKey), longitude: Number(lonKey) }),
    })
      .then(result => result.ok ? result.json() as Promise<SnapshotResult> : null)
      .then(data => { if (active) setSnapshot(data?.status === 'ok' ? data.image ?? null : null); })
      .catch(() => { if (active) setSnapshot(null); });
    return () => { active = false; };
  }, [latKey, lonKey]);

  const distance = fix ? Math.round(distanceMeters(fix, point)) : null;
  return <View style={[styles.frame, currentOnly && styles.compact]} accessible accessibilityLabel={currentOnly ? '地图：你的当前位置' : '地图：留话地点附近'}>
    {snapshot ? <>
      <Image source={{ uri: snapshot }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setSnapshot(null)} />
      <View style={styles.tint} pointerEvents="none" />
      {fix && <View style={styles.accuracy} pointerEvents="none" />}
      <View style={[styles.centerDot, !fix && styles.placeDot]} pointerEvents="none" />
      {!currentOnly && distance != null && <Text style={styles.badge}>距留话点约 {distance} 米</Text>}
    </> : <PreviewPlaceholder distance={distance} compact={currentOnly} />}
  </View>;
}

/** When the static map is unreachable: a road sketch with the position, never an empty card. */
function PreviewPlaceholder({ distance, compact }: { distance: number | null; compact: boolean }) {
  return <View style={styles.fallback}>
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 320 190" preserveAspectRatio="xMidYMid slice">
        <Rect x="0" y="0" width="320" height="190" fill="#16242b" />
        <Path d="M-20 62 L340 36" stroke="#263a42" strokeWidth="14" fill="none" />
        <Path d="M-20 150 L340 128" stroke="#263a42" strokeWidth="10" fill="none" />
        <Path d="M70 -20 L96 210" stroke="#263a42" strokeWidth="12" fill="none" />
        <Path d="M232 -20 L214 210" stroke="#263a42" strokeWidth="8" fill="none" />
        <Rect x="112" y="18" width="58" height="30" rx="4" fill="#1e3038" />
        <Rect x="256" y="96" width="52" height="40" rx="4" fill="#1e3038" />
        <Circle cx="160" cy="95" r="36" fill="#299be333" stroke="#299be366" strokeWidth="1" />
        <Circle cx="160" cy="95" r="7" fill="#299be3" stroke="#fff" strokeWidth="2" />
      </Svg>
    </View>
    {!compact && <>
      <Text style={styles.fallbackDistance}>{distance != null ? `距留话点约 ${distance} 米` : '正在获取地图…'}</Text>
      <Text style={styles.fallbackHint}>静态底图暂不可用，当前为位置示意图。{'\n'}开发版本（development build）可查看可交互地图。</Text>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { height: 190, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface },
  compact: { height: 112, borderRadius: 12 },
  tint: { ...absoluteFill, backgroundColor: '#0b1c26', opacity: 0.3 },
  accuracy: { position: 'absolute', left: '50%', top: '50%', width: 72, height: 72, marginLeft: -36, marginTop: -36, borderRadius: 36, backgroundColor: `${colors.userDot}33`, borderColor: `${colors.userDot}66`, borderWidth: 1 },
  centerDot: { position: 'absolute', left: '50%', top: '50%', width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: 7, backgroundColor: colors.userDot, borderColor: colors.text, borderWidth: 2 },
  placeDot: { backgroundColor: colors.accent },
  badge: { position: 'absolute', left: 12, bottom: 10, color: colors.text, fontSize: 11, backgroundColor: '#0b1c26cc', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  fallback: { ...absoluteFill, backgroundColor: '#0b1c2680', justifyContent: 'center', alignItems: 'center', padding: 20, gap: 8 },
  fallbackDistance: { color: colors.text, fontSize: 22, fontWeight: '600' },
  fallbackHint: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
