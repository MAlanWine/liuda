import { isPoint } from '../../location/geo';

const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const point: unknown = await request.json().catch(() => null);
  if (!isPoint(point)) return Response.json({ status: 'invalid' }, { status: 400, headers });

  const key = process.env.BAIDU_PANORAMA_AK?.trim();
  if (!key) return Response.json({ status: 'unconfigured' }, { status: 503, headers });

  const url = new URL('https://api.map.baidu.com/panorama/v2');
  url.search = new URLSearchParams({
    ak: key,
    location: `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`,
    coordtype: 'wgs84ll',
    width: '800',
    height: '400',
    fov: '180',
  }).toString();

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const type = response.headers.get('content-type')?.split(';')[0];
    if (response.ok && (type === 'image/jpeg' || type === 'image/png')) {
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 0 && bytes.byteLength <= 2_000_000) {
        const pixels = new Uint8Array(bytes);
        let binary = '';
        for (let offset = 0; offset < pixels.length; offset += 8192) {
          binary += String.fromCharCode(...pixels.subarray(offset, offset + 8192));
        }
        const image = `data:${type};base64,${btoa(binary)}`;
        return Response.json({ status: 'ok', image }, { headers });
      }
    } else if (type === 'application/json') {
      const error = await response.json() as { status?: number | string };
      if (Number(error.status) === 402) {
        return Response.json({ status: 'no-coverage' }, { status: 404, headers });
      }
    }
  } catch {
    // Let the caller keep showing the map if the panorama provider fails.
  }
  return Response.json({ status: 'unavailable' }, { status: 502, headers });
}
