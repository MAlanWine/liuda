import type { GeoPoint } from '../api/types.ts';
import { isPoint } from './geo.ts';
import { heat, type HeatInput, type HeatLabel, type HeatTier } from './heat.ts';

export const CLUSTER_DX = 80;
export const CLUSTER_DY = 60;
export const TILE_SIZE = 256;

export type Region = GeoPoint & { latitudeDelta: number; longitudeDelta: number };
export type Clusterable = HeatInput & GeoPoint & { id: string; sceneId: string; name: string };
export type MarkerGroup = {
  id: string; postIds: string[]; count: number; countLabel: string; sceneCount: number; name: string;
  latitude: number; longitude: number; x: number; y: number; tier: HeatTier; heatLabel: HeatLabel; active: boolean;
};

/** Web-mercator zoom for a map region shown `widthPt` points wide. */
export function zoomFromRegion(region: Pick<Region, 'longitudeDelta'>, widthPt: number): number {
  const delta = Math.max(1e-9, Math.abs(region.longitudeDelta));
  return Math.log2((360 * Math.max(1, widthPt)) / (delta * TILE_SIZE));
}

/** World-pixel position (points) at `zoom`. */
export function project(p: GeoPoint, zoom: number): { x: number; y: number } {
  const lat = (Math.max(-85, Math.min(85, p.latitude)) * Math.PI) / 180;
  const world = TILE_SIZE * Math.pow(2, zoom);
  return {
    x: ((p.longitude + 180) / 360) * world,
    y: (0.5 - Math.log((1 + Math.sin(lat)) / (1 - Math.sin(lat))) / (4 * Math.PI)) * world,
  };
}

/**
 * Port of legacy `map-points.js groups`: union posts of the same scene or whose screen footprints
 * overlap (|dx| < 80 and |dy| < 60 pt). Each group is anchored on its member closest to the centroid —
 * never a manufactured point. Group tier = hottest member.
 */
export function groupMarkers<T extends Clusterable>(posts: readonly T[], zoom: number, selectedId: string | null, now: number = Date.now()): MarkerGroup[] {
  const items = posts.filter(isPoint).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((post) => ({ post, point: project(post, zoom) }))
    .filter((item) => Number.isFinite(item.point.x) && Number.isFinite(item.point.y));
  const parents = items.map((_, i) => i);
  const root = (i: number): number => {
    while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; }
    return i;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = items[i], b = items[j];
      const same = !!a.post.sceneId && a.post.sceneId === b.post.sceneId;
      if (same || (Math.abs(a.point.x - b.point.x) < CLUSTER_DX && Math.abs(a.point.y - b.point.y) < CLUSTER_DY)) parents[root(i)] = root(j);
    }
  }
  const buckets = new Map<number, typeof items>();
  items.forEach((item, i) => {
    const key = root(i);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item); else buckets.set(key, [item]);
  });
  return Array.from(buckets.values()).map((bucket) => {
    const cx = bucket.reduce((sum, item) => sum + item.point.x, 0) / bucket.length;
    const cy = bucket.reduce((sum, item) => sum + item.point.y, 0) / bucket.length;
    const anchor = bucket.reduce((best, item) =>
      Math.hypot(item.point.x - cx, item.point.y - cy) < Math.hypot(best.point.x - cx, best.point.y - cy) ? item : best);
    const postIds = bucket.map((item) => item.post.id);
    const sceneCount = new Set(bucket.map((item) => item.post.sceneId || item.post.id)).size;
    const hottest = bucket.map((item) => heat(item.post, now)).sort((a, b) => b.score - a.score)[0];
    return {
      id: postIds.join('|'), postIds, count: bucket.length, countLabel: bucket.length > 9 ? '9+' : String(bucket.length), sceneCount,
      name: sceneCount === 1 ? anchor.post.name : '附近的留话',
      latitude: anchor.post.latitude, longitude: anchor.post.longitude,
      x: Math.round(anchor.point.x), y: Math.round(anchor.point.y),
      tier: hottest.tier, heatLabel: hottest.label, active: selectedId !== null && postIds.includes(selectedId),
    };
  });
}
