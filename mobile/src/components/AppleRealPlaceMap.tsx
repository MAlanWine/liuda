import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import { toMapCoordinate } from '../domain/crs';
import type { RealPlaceMapProps } from './RealPlaceMap';
import { colors } from './ui';

const METERS_PER_LAT_DEGREE = 111_195;
const EDGE = { top: 48, right: 48, bottom: 64, left: 48 };

function metersPerLonDegree(latitude: number) {
  return METERS_PER_LAT_DEGREE * Math.max(0.01, Math.cos(latitude * Math.PI / 180));
}

/** Region centred on `center` that still shows `point`; sized in metres so a wide frame doesn't zoom out to a square. */
function regionFor(point: { latitude: number; longitude: number }, center: { latitude: number; longitude: number }, aspect: number, minMeters: number): Region {
  const lonMeters = metersPerLonDegree(center.latitude);
  const eastWest = Math.abs(((point.longitude - center.longitude + 540) % 360) - 180) * lonMeters;
  const northSouth = Math.abs(point.latitude - center.latitude) * METERS_PER_LAT_DEGREE;
  const forPoint = 2.7 * Math.max(northSouth, eastWest / Math.max(aspect, 0.01));
  const maximum = 2_000 / Math.hypot(1, aspect);
  const height = Math.min(maximum, Math.max(minMeters, forPoint));
  return { latitude: center.latitude, longitude: center.longitude, latitudeDelta: height / METERS_PER_LAT_DEGREE, longitudeDelta: height * aspect / lonMeters };
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduce(value); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { active = false; sub.remove(); };
  }, []);
  return reduce;
}

/**
 * Apple Maps view of the place and the user. Every coordinate goes through `toMapCoordinate` (GCJ-02 inside mainland
 * China, D-5); the user is drawn as a Marker + accuracy circle (not `showsUserLocation`). `currentOnly` = compact,
 * static, user only (leave screen). Otherwise interactive: pan/zoom, 回到我, 跟随, 全览.
 */
export default function RealPlaceMap({ point, fix, currentOnly = false, interactive = !currentOnly }: RealPlaceMapProps) {
  const [aspect, setAspect] = useState(0);
  const [follow, setFollow] = useState(false);
  const [ready, setReady] = useState(false);
  const map = useRef<MapView>(null);
  const region = useRef<Region | null>(null);
  const userMoved = useRef(false);
  const fitted = useRef(false);
  const reduceMotion = useReduceMotion();
  const duration = reduceMotion ? 0 : 350;

  const pointLat = point.latitude, pointLon = point.longitude;
  const mapPoint = useMemo(() => toMapCoordinate({ latitude: pointLat, longitude: pointLon }), [pointLat, pointLon]);
  const fixLat = fix?.latitude, fixLon = fix?.longitude;
  const mapFix = useMemo(() => fixLat == null || fixLon == null ? null : toMapCoordinate({ latitude: fixLat, longitude: fixLon }), [fixLat, fixLon]);
  const accuracy = Math.max(3, Math.min(fix?.accuracy ?? 3, 200));

  // Static (currentOnly) maps stay controlled; interactive maps start here and then belong to the user.
  const staticRegion = aspect > 0 ? regionFor(mapPoint, mapFix ?? mapPoint, aspect, currentOnly ? 60 : 110) : null;
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  if (interactive && staticRegion && !initialRegion) setInitialRegion(staticRegion);

  function fitBoth(animated: boolean) {
    if (!mapFix) {
      map.current?.animateToRegion(regionFor(mapPoint, mapPoint, aspect || 1, 110), animated ? duration : 0);
      return;
    }
    map.current?.fitToCoordinates([mapPoint, mapFix], { edgePadding: EDGE, animated: animated && !reduceMotion });
  }

  function centerOnMe() {
    if (!mapFix) return;
    const current = region.current;
    const latitudeDelta = Math.min(current?.latitudeDelta ?? 0.002, 0.004);
    const longitudeDelta = current ? current.longitudeDelta * latitudeDelta / current.latitudeDelta : latitudeDelta;
    map.current?.animateToRegion({ latitude: mapFix.latitude, longitude: mapFix.longitude, latitudeDelta, longitudeDelta }, duration);
  }

  // First fix after mount: show both once, unless the user already moved the map.
  useEffect(() => {
    if (!interactive || !ready || !mapFix || fitted.current || userMoved.current) return;
    fitted.current = true;
    const timer = setTimeout(() => {
      map.current?.fitToCoordinates([mapPoint, mapFix], { edgePadding: EDGE, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [interactive, ready, mapFix, mapPoint]);

  // 跟随: keep the user centred on every new fix (zoom kept).
  useEffect(() => {
    if (!interactive || !follow || !mapFix) return;
    const current = region.current;
    if (!current) return;
    map.current?.animateToRegion({ ...current, latitude: mapFix.latitude, longitude: mapFix.longitude }, duration);
  }, [interactive, follow, mapFix, duration]);

  return (
    <View
      style={[styles.frame, currentOnly ? styles.compact : interactive && styles.large]}
      onLayout={({ nativeEvent: { layout: { width, height } } }) => {
        if (width > 0 && height > 0) setAspect(width / height);
      }}
      accessible={!interactive}
      accessibilityLabel={currentOnly ? '地图：你的当前位置' : undefined}
    >
      {staticRegion && (interactive
        ? initialRegion && <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={initialRegion} rotateEnabled={false} pitchEnabled={false}
            showsCompass={false} showsScale onMapReady={() => setReady(true)} accessibilityLabel="地图：留话地点与你的位置，可拖动和缩放"
            onRegionChangeComplete={(next, details) => {
              region.current = next;
              if (details?.isGesture) { userMoved.current = true; setFollow(false); }
            }}>
            <Marker coordinate={mapPoint} title="留话地点" pinColor={colors.accent} />
            {mapFix && <Circle center={mapFix} radius={accuracy} fillColor={`${colors.userDot}33`} strokeColor={colors.userDot} strokeWidth={1} />}
            {mapFix && <Marker coordinate={mapFix} title="你的位置" anchor={{ x: 0.5, y: 0.5 }} zIndex={2} tracksViewChanges={false}><View style={styles.dot} /></Marker>}
          </MapView>
        : <MapView style={StyleSheet.absoluteFill} region={staticRegion} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}>
            {!currentOnly && <Marker coordinate={mapPoint} title="留话地点" pinColor={colors.accent} />}
            {mapFix && <Circle center={mapFix} radius={accuracy} fillColor={`${colors.userDot}33`} strokeColor={colors.userDot} strokeWidth={1} />}
            {mapFix && <Marker coordinate={mapFix} title="你的位置" anchor={{ x: 0.5, y: 0.5 }} zIndex={2} tracksViewChanges={false}><View style={styles.dot} /></Marker>}
          </MapView>)}
      {interactive && initialRegion && <View style={styles.controls}>
        <MapButton icon="scan-outline" label="全览" accessibilityLabel="同时查看留话地点和你" onPress={() => { setFollow(false); fitBoth(true); }} />
        <MapButton icon="locate" label="回到我" accessibilityLabel="回到我的位置" disabled={!mapFix} onPress={centerOnMe} />
        <MapButton icon={follow ? 'navigate' : 'navigate-outline'} label="跟随" accessibilityLabel={follow ? '停止跟随我的位置' : '跟随我的位置'}
          selected={follow} disabled={!mapFix} onPress={() => { const next = !follow; setFollow(next); if (next) centerOnMe(); }} />
      </View>}
    </View>
  );
}

function MapButton({ icon, label, accessibilityLabel, onPress, disabled = false, selected = false }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; accessibilityLabel: string; onPress: () => void; disabled?: boolean; selected?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled, selected }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, selected && styles.selected, disabled && styles.disabled, pressed && styles.pressed]}>
    <Ionicons name={icon} size={16} color={selected ? colors.onAccent : colors.text} />
    <Text style={[styles.buttonText, selected && styles.selectedText]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  frame: { height: 190, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface },
  large: { height: 260 },
  compact: { height: 112, borderRadius: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.userDot, borderColor: colors.text, borderWidth: 2 },
  controls: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', gap: 6 },
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  buttonText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  selectedText: { color: colors.onAccent },
});
