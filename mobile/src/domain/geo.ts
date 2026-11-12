import type { GeoPoint } from '../api/types.ts';

export type { GeoPoint };

export const EARTH_RADIUS = 6371008.8;
const RAD = Math.PI / 180;

export function isPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== 'object') return false;
  const { latitude, longitude } = value as GeoPoint;
  return typeof latitude === 'number' && typeof longitude === 'number'
    && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}

/** Haversine distance in metres; Infinity when either point is invalid. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  if (!isPoint(a) || !isPoint(b)) return Infinity;
  const lat = (b.latitude - a.latitude) * RAD;
  const lon = (b.longitude - a.longitude) * RAD;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * RAD) * Math.cos(b.latitude * RAD) * Math.sin(lon / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/** Point `east` / `north` metres away from `origin` (local flat approximation, fine below a few km). */
export function offsetMeters(origin: GeoPoint, east: number, north: number): GeoPoint {
  return {
    latitude: origin.latitude + north / EARTH_RADIUS / RAD,
    longitude: origin.longitude + east / (EARTH_RADIUS * Math.cos(origin.latitude * RAD)) / RAD,
  };
}

/** East / north metres of `point` relative to `origin`. */
export function localMeters(point: GeoPoint, origin: GeoPoint): { east: number; north: number } {
  return {
    east: (point.longitude - origin.longitude) * RAD * EARTH_RADIUS * Math.cos(origin.latitude * RAD),
    north: (point.latitude - origin.latitude) * RAD * EARTH_RADIUS,
  };
}

/**
 * A point `metresFromTarget` away from `target`, on the side facing `from`
 * (used by 模拟走近 / 模拟到场). If `from` is on the target, steps south.
 */
export function pointToward(from: GeoPoint, target: GeoPoint, metresFromTarget: number): GeoPoint {
  const { east, north } = localMeters(from, target);
  const length = Math.hypot(east, north);
  if (!Number.isFinite(length) || length < 0.01) return offsetMeters(target, 0, -metresFromTarget);
  const scale = metresFromTarget / length;
  return offsetMeters(target, east * scale, north * scale);
}

/** `86m` / `1.2km`; `已参与` when the distance is unknown. */
export function distanceLabel(distance: number | null): string {
  if (distance === null || !Number.isFinite(distance)) return '已参与';
  const d = Math.round(distance);
  return d >= 1000 ? (d / 1000).toFixed(1) + 'km' : d + 'm';
}
