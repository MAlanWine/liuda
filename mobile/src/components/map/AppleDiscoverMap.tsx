import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { GeoPoint, PositionEvidence } from '../../api';
import { groupMarkers, zoomFromRegion, type MarkerGroup, type Region } from '../../domain/cluster';
import { toMapCoordinate } from '../../domain/crs';
import { SIMULATED_ORIGIN } from '../../state/position';
import { useMinuteClock } from '../feed/FeedList';
import { colors } from '../ui';
import { CommaMarker } from './CommaMarker';
import type { DiscoverMapProps } from './DiscoverMap';
import { GroupSheet } from './GroupSheet';

const START_DELTA = 0.006;
const MAX_ZOOM = 20;
const ZOOM_STEP = 2;

const regionAround = (p: GeoPoint, delta: number): Region => ({ ...toMapCoordinate(p), latitudeDelta: delta, longitudeDelta: delta });

/** Own position as a Marker (not `showsUserLocation`) so it goes through the same CRS conversion as everything else. */
function SelfMarker({ fix, simulated }: { fix: PositionEvidence; simulated: boolean }) {
  const [tracks, setTracks] = useState(true);
  const [shownSimulated, setShownSimulated] = useState(simulated);
  if (shownSimulated !== simulated) { setShownSimulated(simulated); setTracks(true); }
  return <Marker coordinate={toMapCoordinate(fix)} anchor={{ x: 0.5, y: 0.5 }} zIndex={4} tracksViewChanges={tracks}
    title={simulated ? '模拟位置' : '你的位置'}>
    <View onLayout={() => { if (tracks) requestAnimationFrame(() => setTracks(false)); }}
      style={[s.self, simulated && s.selfSimulated]} />
  </Marker>;
}

/**
 * Discover map (Apple Maps): comma markers grouped by `groupMarkers` at the current zoom, own position, 回到我,
 * 附近 N 条 list. Every coordinate handed to the map goes through `toMapCoordinate` (WGS-84 -> GCJ-02 in mainland China).
 * Cross-place group tap -> zoom in two levels (and open the list if it still does not split); same-place group -> list.
 */
export default function DiscoverMap({ posts, fix, mode, sort, onSortChange, onOpen, onSimulate }: DiscoverMapProps) {
  const mapRef = useRef<MapView>(null);
  const now = useMinuteClock();
  const [width, setWidth] = useState(0);
  const [initialRegion] = useState(() => regionAround(fix ?? posts[0] ?? SIMULATED_ORIGIN, START_DELTA));
  const [region, setRegion] = useState<Region>(initialRegion);
  const [sheet, setSheet] = useState<{ ids: string[]; title: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendingList = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Centre once on the first fix if the map opened before one existed.
  const centred = useRef(fix !== null);
  useEffect(() => {
    if (!fix || centred.current) return;
    centred.current = true;
    mapRef.current?.animateToRegion(regionAround(fix, START_DELTA), 400);
  }, [fix]);
  useEffect(() => () => { if (pendingList.current) clearTimeout(pendingList.current); }, []);

  const zoom = width > 0 ? zoomFromRegion(region, width) : 16;
  const groups = useMemo(() => groupMarkers(posts, zoom, selectedId, now), [posts, zoom, selectedId, now]);
  const sheetPosts = useMemo(() => sheet ? posts.filter(p => sheet.ids.includes(p.id)) : [], [posts, sheet]);

  const openList = (ids: string[], title: string, select: string | null = null) => {
    setSheet({ ids, title });
    setSelectedId(select);
  };
  const onGroupPress = (group: MarkerGroup) => {
    if (group.count === 1) return openList(group.postIds, group.name, group.postIds[0]);
    const title = `这组 ${group.count} 条`;
    if (group.sceneCount === 1 || zoom + ZOOM_STEP > MAX_ZOOM) return openList(group.postIds, title);
    const factor = Math.pow(2, ZOOM_STEP);
    mapRef.current?.animateToRegion({ ...toMapCoordinate(group), latitudeDelta: region.latitudeDelta / factor, longitudeDelta: region.longitudeDelta / factor }, 350);
    const members = posts.filter(p => group.postIds.includes(p.id));
    if (groupMarkers(members, zoom + ZOOM_STEP, null, now).length === 1) {
      if (pendingList.current) clearTimeout(pendingList.current);
      pendingList.current = setTimeout(() => openList(group.postIds, title), 400);
    }
  };
  const recentre = () => {
    if (fix) mapRef.current?.animateToRegion(regionAround(fix, Math.min(region.latitudeDelta, START_DELTA)), 350);
  };
  const close = () => { setSheet(null); setSelectedId(null); };
  const open = (post: Parameters<typeof onOpen>[0]) => { close(); onOpen(post); };

  return <View style={s.fill} onLayout={e => setWidth(Math.round(e.nativeEvent.layout.width))}>
    <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={initialRegion} onRegionChangeComplete={r => setRegion(r)}
      userInterfaceStyle="dark" rotateEnabled={false} pitchEnabled={false} showsUserLocation={false} toolbarEnabled={false}>
      {fix && mode === 'gps' && fix.accuracy !== null && fix.accuracy > 0 && <Circle center={toMapCoordinate(fix)} radius={Math.min(fix.accuracy, 100)}
        fillColor={`${colors.accent}26`} strokeColor={colors.accent} strokeWidth={1} />}
      {groups.map(group => <CommaMarker key={group.id} group={group} onPress={onGroupPress} />)}
      {fix && <SelfMarker fix={fix} simulated={mode === 'simulated'} />}
    </MapView>
    <View style={s.top} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel="回到我的位置" disabled={!fix} onPress={recentre}
        style={({ pressed }) => [s.round, !fix && s.disabled, pressed && s.pressed]}>
        <Ionicons name="locate" size={20} color={colors.text} />
      </Pressable>
    </View>
    {posts.length > 0 && <View style={s.bottom} pointerEvents="box-none">
      <Pressable accessibilityRole="button" onPress={() => openList(posts.map(p => p.id), `附近 ${posts.length} 条`)}
        style={({ pressed }) => [s.pill, pressed && s.pressed]}>
        <Ionicons name="list" size={16} color={colors.text} />
        <Text style={s.pillText}>附近 {posts.length} 条</Text>
      </Pressable>
    </View>}
    <GroupSheet visible={sheet !== null} title={sheet?.title ?? ''} posts={sheetPosts} sort={sort} onSortChange={onSortChange}
      selectedId={selectedId} onSelect={setSelectedId} onOpen={open} onSimulate={onSimulate} mode={mode} now={now} onClose={close} />
  </View>;
}
const s = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  self: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.text },
  selfSimulated: { backgroundColor: colors.demo },
  top: { position: 'absolute', top: 12, right: 12 },
  bottom: { position: 'absolute', left: 12, bottom: 12, right: 12, flexDirection: 'row' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  pill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  pillText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
