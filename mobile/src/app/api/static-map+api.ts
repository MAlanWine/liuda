import { isPoint } from '../../location/geo';

// Expo Go 没有 react-native-maps 的原生模块，用高德静态地图返回真实底图。
// key 只在服务端读取，前端拿到的只有 base64 图片，不暴露任何凭据。
const headers = { 'Cache-Control': 'no-store' };

type ConvertResult = { status?: string; locations?: string };

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export async function POST(request: Request) {
  const point: unknown = await request.json().catch(() => null);
  if (!isPoint(point)) return Response.json({ status: 'invalid' }, { status: 400, headers });

  const key = process.env.AMAP_WEB_SERVICE_KEY?.trim();
  if (!key) return Response.json({ status: 'unconfigured' }, { status: 503, headers });

  try {
    const signal = AbortSignal.timeout(6000);
    // expo-location 给的是 WGS-84，高德静态图需要 GCJ-02，先做坐标转换。
    const convert = new URL('https://restapi.amap.com/v3/assistant/coordinate/convert');
    convert.search = new URLSearchParams({
      key, coordsys: 'gps', locations: `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`,
    }).toString();
    const converted = await fetch(convert, { signal }).then(result => result.json()) as ConvertResult;
    if (converted.status !== '1' || !converted.locations) throw new Error('Coordinate conversion failed');

    const url = new URL('https://restapi.amap.com/v3/staticmap');
    url.search = new URLSearchParams({
      key, location: converted.locations, zoom: '16', size: '750*400', scale: '1',
    }).toString();
    const response = await fetch(url, { signal });
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || (type !== 'image/png' && type !== 'image/jpeg')) throw new Error('Static map unavailable');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 2_000_000) throw new Error('Invalid image size');
    return Response.json({ status: 'ok', image: `data:${type};base64,${toBase64(bytes)}` }, { headers });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 502, headers });
  }
}
