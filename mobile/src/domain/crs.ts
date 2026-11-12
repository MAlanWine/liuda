import type { GeoPoint } from '../api/types.ts';

// Rough mainland-China outline as [north, west, south, east] boxes (common public approximation),
// minus Taiwan, Hong Kong, Macau and neighbouring-country corners.
const INCLUDE: readonly (readonly [number, number, number, number])[] = [
  [49.2204, 79.4462, 42.8899, 96.33],
  [54.1415, 109.6872, 39.3742, 135.0002],
  [42.8899, 73.1246, 29.5297, 124.143255],
  [29.5297, 82.9684, 26.7186, 97.0352],
  [29.5297, 97.0253, 20.414096, 124.367395],
  [20.414096, 107.975793, 17.871542, 111.744104],
];
const EXCLUDE: readonly (readonly [number, number, number, number])[] = [
  [25.398623, 119.921265, 21.785006, 122.497559], // Taiwan
  [22.5700, 113.8300, 22.1500, 114.4400], // Hong Kong
  [22.2200, 113.5200, 22.1000, 113.6100], // Macau
  [22.2840, 101.8652, 20.0988, 106.6650],
  [21.5422, 106.4525, 20.4878, 108.0510],
  [55.8175, 109.0323, 50.3257, 119.1270],
  [55.8175, 127.4568, 49.5574, 137.0227],
  [44.8922, 131.2662, 42.5692, 137.0227],
];
const inBox = (p: GeoPoint, [n, w, s, e]: readonly [number, number, number, number]) =>
  p.latitude <= n && p.latitude >= s && p.longitude >= w && p.longitude <= e;

export function inMainlandChina(p: GeoPoint): boolean {
  return INCLUDE.some((box) => inBox(p, box)) && !EXCLUDE.some((box) => inBox(p, box));
}

const A = 6378245.0;
const EE = 0.00669342162296594323;

function transformLat(x: number, y: number): number {
  let r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  r += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  r += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return r;
}
function transformLon(x: number, y: number): number {
  let r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  r += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  r += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return r;
}

/** Standard WGS-84 -> GCJ-02 forward transform (no region check). */
export function wgs84ToGcj02(p: GeoPoint): GeoPoint {
  const dLat0 = transformLat(p.longitude - 105.0, p.latitude - 35.0);
  const dLon0 = transformLon(p.longitude - 105.0, p.latitude - 35.0);
  const radLat = (p.latitude / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLat = (dLat0 * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI);
  const dLon = (dLon0 * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { latitude: p.latitude + dLat, longitude: p.longitude + dLon };
}

/** Coordinate to hand to react-native-maps: GCJ-02 inside mainland China, unchanged elsewhere. */
export function toMapCoordinate(p: GeoPoint): GeoPoint {
  return inMainlandChina(p) ? wgs84ToGcj02(p) : { latitude: p.latitude, longitude: p.longitude };
}
