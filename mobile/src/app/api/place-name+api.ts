import { isPoint } from '../../location/geo';

type MapResult = {
  status?: string;
  locations?: string;
  regeocode?: {
    formatted_address?: string;
    addressComponent?: { neighborhood?: { name?: unknown }; building?: { name?: unknown } };
    aois?: { name?: unknown }[];
    pois?: { name?: unknown; distance?: string }[];
  };
};

function label(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function query(path: string, parameters: Record<string, string>, signal: AbortSignal): Promise<MapResult> {
  const url = new URL(path, 'https://restapi.amap.com');
  url.search = new URLSearchParams(parameters).toString();
  const result = await fetch(url, { signal });
  if (!result.ok) throw new Error('Map service unavailable');
  const data = await result.json() as MapResult;
  if (data.status !== '1') throw new Error('Map service unavailable');
  return data;
}

export async function POST(request: Request) {
  const respond = (body: object, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const point: unknown = await request.json().catch(() => null);
  if (!isPoint(point)) return respond({ error: 'Invalid coordinates' }, 400);
  const key = process.env.AMAP_WEB_SERVICE_KEY?.trim();
  if (!key) return respond({ error: 'Map service not configured' }, 503);

  try {
    const signal = AbortSignal.timeout(4500);
    const converted = await query('/v3/assistant/coordinate/convert', {
      key, coordsys: 'gps', locations: `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`,
    }, signal);
    if (!converted.locations) throw new Error('Map coordinate unavailable');
    const { regeocode } = await query('/v3/geocode/regeo', {
      key, location: converted.locations, extensions: 'all', radius: '100',
    }, signal);
    if (!regeocode) throw new Error('Map address unavailable');
    const area = label(regeocode.addressComponent?.neighborhood?.name)
      || label(regeocode.addressComponent?.building?.name)
      || regeocode.aois?.map(item => label(item.name)).find(Boolean)
      || '';
    const landmark = (regeocode.pois ?? [])
      .filter(item => label(item.name) && item.distance && Number.isFinite(Number(item.distance)))
      .sort((a, b) => Number(a.distance) - Number(b.distance))
      .map(item => label(item.name))[0] || '';
    return respond({ area, address: label(regeocode.formatted_address), landmark: area ? '' : landmark });
  } catch {
    return respond({ error: 'Map lookup unavailable' }, 502);
  }
}
