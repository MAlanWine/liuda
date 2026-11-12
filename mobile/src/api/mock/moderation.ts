// 演示审核 stub: a fixed term list + mainland mobile numbers; images are checked for format/size only.
export const BLOCKED_TERMS = ['加微信', '代写', '赌博', '约炮', '测试违规'] as const;
const MOBILE_NUMBER = /1[3-9]\d{9}/;

export const PHOTO_MAX_BASE64 = 700_000;
export const PHOTO_MAX_BYTES = 524_288;

export function checkText(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  return !BLOCKED_TERMS.some((term) => compact.includes(term)) && !MOBILE_NUMBER.test(compact);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeHead(base64: string, bytes: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 3 < base64.length && out.length < bytes; i += 4) {
    const n = (ALPHABET.indexOf(base64[i]) << 18) | (ALPHABET.indexOf(base64[i + 1]) << 12)
      | ((ALPHABET.indexOf(base64[i + 2]) & 63) << 6) | (ALPHABET.indexOf(base64[i + 3]) & 63);
    out.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  return out.slice(0, bytes);
}

export type PhotoCheck = { ok: true; bytes: number } | { ok: false; code: 'PHOTO_SIZE' | 'PHOTO_FORMAT' };

/** base64 ≤700 000 chars, decoded ≤512 KB, JPEG magic FF D8 FF. */
export function checkPhoto(base64: unknown): PhotoCheck {
  if (typeof base64 !== 'string' || base64.length > PHOTO_MAX_BASE64) return { ok: false, code: 'PHOTO_SIZE' };
  if (base64.length < 16 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { ok: false, code: 'PHOTO_FORMAT' };
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bytes = (base64.length / 4) * 3 - padding;
  if (bytes > PHOTO_MAX_BYTES) return { ok: false, code: 'PHOTO_SIZE' };
  const head = decodeHead(base64, 3);
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return { ok: false, code: 'PHOTO_FORMAT' };
  return { ok: true, bytes };
}
