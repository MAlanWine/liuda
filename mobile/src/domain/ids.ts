// Pure id / hash helpers (no node `crypto`, works on Hermes and in node --test).
export type Random = () => number;

export const REQUEST_ID_PATTERN = /^[a-zA-Z0-9-]{12,80}$/;

function base36(length: number, random: Random): string {
  let out = '';
  while (out.length < length) out += Math.floor(random() * 36).toString(36);
  return out;
}

export function randomHex(length: number, random: Random = Math.random): string {
  let out = '';
  while (out.length < length) out += Math.floor(random() * 16).toString(16);
  return out;
}

/** Idempotency key for one user intent; reuse it for retries of the same write. */
export function newRequestId(random: Random = Math.random, now: number = Date.now()): string {
  return Math.max(0, Math.floor(now)).toString(36) + '-' + base36(10, random) + '-' + base36(8, random);
}

export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

export function newId(prefix: string, random: Random = Math.random, now: number = Date.now()): string {
  return prefix + '-' + Math.max(0, Math.floor(now)).toString(36) + base36(8, random);
}

/** Stable 64-bit-ish string hash (cyrb53 ×2) as 16 lowercase hex chars. Not cryptographic. */
export function hashString(value: string): string {
  const half = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < value.length; i++) {
      const ch = value.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 >>> 0).toString(16).padStart(8, '0');
  };
  return half(0) + half(0x9e3779b9);
}
