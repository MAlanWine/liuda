export type Point = { latitude: number; longitude: number };
export type Fix = Point & { accuracy: number | null; timestamp: number };

export function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const { latitude, longitude } = value as Point;
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}

export function distanceMeters(from: Point, to: Point) {
  const radians = Math.PI / 180;
  const latitudeDelta = (to.latitude - from.latitude) * radians;
  const longitudeDelta = (to.longitude - from.longitude) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function usableFix(fix: Fix | null | undefined): fix is Fix {
  return !!fix && isPoint(fix) && fix.accuracy !== null && fix.accuracy >= 0
    && fix.accuracy <= 25 && Date.now() - fix.timestamp <= 30_000;
}

export function atPoint(fix: Fix | null | undefined, point: Point) {
  return usableFix(fix) && distanceMeters(fix, point) <= 30;
}
