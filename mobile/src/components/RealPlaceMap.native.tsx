import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Constants from 'expo-constants';
import { devApiUrl } from '../location/api';
import { distanceMeters, type Fix, type Point } from '../location/geo';

// Expo Go 不包含 react-native-maps 的原生模块，静态导入会在模块加载时崩溃。
// Expo Go 走「服务端高德静态底图 + 自定义覆盖层」；development build 走原生可交互地图。
const inExpoGo = Constants.executionEnvironment === 'storeClient';
type MapsModule = typeof import('react-native-maps');
let cachedMaps: MapsModule | null = null;
function loadMaps(): MapsModule | null {
  if (inExpoGo) return null;
  // 动态加载是刻意为之：静态导入 react-native-maps 在 Expo Go 中会在模块加载时崩溃。
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!cachedMaps) cachedMaps = require('react-native-maps') as MapsModule;
  return cachedMaps;
}

type SnapshotResult = { status?: string; image?: string };

// RN 0.88 的类型里已移除 StyleSheet.absoluteFillObject，用等价对象展开。
const absoluteFill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

// 服务端底图不可达时的兜底：至少给出带路网的位置示意，而不是空白卡片。
function PreviewPlaceholder({ distance }: { distance: number | null }) {
  return <View style={styles.fallback}>
    <View style={styles.placeholderMap} pointerEvents="none">
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
    <Text style={styles.fallbackDistance}>{distance != null ? `距留话点约 ${distance} 米` : '正在获取地图…'}</Text>
    <Text style={styles.fallbackHint}>静态底图暂不可用，当前为位置示意图。{'\n'}development build 可查看真实可交互地图。</Text>
  </View>;
}

export default function RealPlaceMap({ point, fix, currentOnly = false }: { point: Point; fix: Fix | null; currentOnly?: boolean }) {
  const [aspect, setAspect] = useState(0);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const maps = loadMaps();
  const center = fix ?? point;

  useEffect(() => {
    if (!inExpoGo) return;
    const url = devApiUrl('/api/static-map');
    if (!url) return;
    let active = true;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: center.latitude, longitude: center.longitude }),
    })
      .then(result => result.ok ? result.json() as Promise<SnapshotResult> : null)
      .then(data => { if (active) setSnapshot(data?.status === 'ok' ? data.image ?? null : null); })
      .catch(() => {});
    return () => { active = false; };
  }, [center.latitude, center.longitude]);

  if (!maps) {
    const distance = fix ? Math.round(distanceMeters(fix, point)) : null;
    return (
      <View style={[styles.frame, currentOnly && styles.compact]}>
        {snapshot ? <>
          <Image source={{ uri: snapshot }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setSnapshot(null)} />
          <View style={styles.tint} pointerEvents="none" />
          <View style={styles.accuracy} pointerEvents="none" />
          <View style={styles.centerDot} pointerEvents="none" />
          {!currentOnly && distance != null && <Text style={styles.badge}>距留话点约 {distance} 米</Text>}
        </> : <PreviewPlaceholder distance={distance} />}
      </View>
    );
  }

  const MapView = maps.default;
  const { Circle, Marker } = maps;
  const metersPerLatitudeDegree = 111_195;
  const metersPerLongitudeDegree = metersPerLatitudeDegree
    * Math.max(0.01, Math.cos(center.latitude * Math.PI / 180));
  const eastWestGap = Math.abs(((point.longitude - center.longitude + 540) % 360) - 180)
    * metersPerLongitudeDegree;
  const northSouthGap = Math.abs(point.latitude - center.latitude) * metersPerLatitudeDegree;
  // Size the viewport in meters first so a wide preview doesn't zoom out to fit a square region.
  const heightForPoint = 2.7 * Math.max(northSouthGap, eastWestGap / Math.max(aspect, 0.01));
  const maximumHeight = 2_000 / Math.hypot(1, aspect);
  const heightMeters = Math.min(maximumHeight, Math.max(currentOnly ? 60 : 110, heightForPoint));
  const region = {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: heightMeters / metersPerLatitudeDegree,
    longitudeDelta: heightMeters * aspect / metersPerLongitudeDegree,
  };
  return (
    <View
      style={[styles.frame, currentOnly && styles.compact]}
      onLayout={({ nativeEvent: { layout: { width, height } } }) => {
        if (width > 0 && height > 0) setAspect(width / height);
      }}
    >
      {aspect > 0 && <MapView style={StyleSheet.absoluteFill} region={region} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}>
        {!currentOnly && <Marker coordinate={point} title="留话地点" pinColor="#ffffff" />}
        {fix && <Circle center={fix} radius={Math.max(3, Math.min(fix.accuracy ?? 3, 100))} fillColor="#299be333" strokeColor="#299be3" strokeWidth={1} />}
        {fix && <Marker coordinate={fix} title="你的位置" anchor={{ x: 0.5, y: 0.5 }} centerOffset={{ x: 0, y: 0 }} zIndex={2}><View style={styles.dot} /></Marker>}
      </MapView>}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 190, borderRadius: 18, overflow: 'hidden', backgroundColor: '#1a2225' },
  compact: { height: 112, borderRadius: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#299be3', borderColor: '#fff', borderWidth: 2 },
  tint: { ...absoluteFill, backgroundColor: '#0b1c26', opacity: 0.3 },
  accuracy: { position: 'absolute', left: '50%', top: '50%', width: 72, height: 72, marginLeft: -36, marginTop: -36, borderRadius: 36, backgroundColor: '#299be333', borderColor: '#299be366', borderWidth: 1 },
  centerDot: { position: 'absolute', left: '50%', top: '50%', width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: 7, backgroundColor: '#299be3', borderColor: '#fff', borderWidth: 2 },
  badge: { position: 'absolute', left: 12, bottom: 10, color: '#f1f4ef', fontSize: 11, backgroundColor: '#0b1c26cc', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  placeholderMap: { ...absoluteFill },
  fallback: { ...absoluteFill, backgroundColor: '#0b1c2680', justifyContent: 'center', alignItems: 'center', padding: 20, gap: 8 },
  fallbackDistance: { color: '#f1f4ef', fontSize: 22, fontWeight: '600' },
  fallbackHint: { color: '#a6b1b5', fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
