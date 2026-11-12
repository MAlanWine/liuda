import { ApiError } from '../api/errors.ts';

export const TEXT_MAX = 300;
export const NAME_MAX = 40;
export const CLUE_MAX = 80;
export const GREETING_MAX = 100;
export const CHAT_TEXT_MAX = 500;
export const REPORT_NOTE_MAX = 200;
export const POST_CAP = 50;
export const THREAD_CAP = 100;
export const CHAT_MESSAGE_CAP = 500;
export const TEASER_LENGTH = 14;

/** Length in Unicode code points (emoji count as one). */
export function codePoints(value: string): number {
  return Array.from(value).length;
}

export type TextCheck = { ok: true; value: string } | { ok: false; length: number };

/** Trims, then checks `min`..`max` code points. */
export function checkText(value: unknown, max: number, min = 1): TextCheck {
  if (typeof value !== 'string') return { ok: false, length: 0 };
  const trimmed = value.trim();
  const length = codePoints(trimmed);
  return length >= min && length <= max ? { ok: true, value: trimmed } : { ok: false, length };
}

/** Like `checkText` but throws `INVALID_INPUT` `<field>长度不正确。`. */
export function validateText(value: unknown, max: number, field: string, min = 1): string {
  const result = checkText(value, max, min);
  if (!result.ok) throw new ApiError('INVALID_INPUT', field + '长度不正确。');
  return result.value;
}

/** First 14 code points + `……` (legacy teaser). */
export function teaserOf(text: string): string {
  const chars = Array.from(text.trim());
  return chars.length <= TEASER_LENGTH ? chars.join('') : chars.slice(0, TEASER_LENGTH).join('') + '……';
}

/** Connector words a shortened (English) place name should not end on. */
const DANGLING = new Set(['and', 'of', 'the', 'at', 'in', 'on', 'for', 'to', 'by', 'a', 'an', '&']);
const SEPARATOR = /[\s,，、·・\-–—/|()（）]/u;

/**
 * Shortens a suggested place name to `max` code points at a word / segment boundary: never mid-word, without trailing
 * separators or a dangling connector ("…Business and" → "…Business"). CJK text has no spaces, so it is cut at the last
 * separator (·、，) when one exists in the second half, else per character. Shorter names are only trimmed.
 */
export function shortenName(value: string, max: number = NAME_MAX): string {
  const chars = Array.from(value.trim());
  if (chars.length <= max) return chars.join('');
  let cut = chars.slice(0, max);
  const next = chars[max];
  if (!SEPARATOR.test(next)) {
    // The cut lands inside a word or segment: back off to the last separator, if that keeps at least half the room.
    let last = -1;
    for (let i = cut.length - 1; i >= 0; i--) if (SEPARATOR.test(cut[i])) { last = i; break; }
    if (last >= Math.floor(max / 2)) cut = cut.slice(0, last);
  }
  let out = cut.join('').replace(/[\s,，、·・\-–—/|(（]+$/u, '');
  for (;;) {
    const words = out.split(/\s+/);
    if (words.length < 2 || !DANGLING.has(words[words.length - 1].toLowerCase())) break;
    out = words.slice(0, -1).join(' ').replace(/[\s,，、·・\-–—/|(（]+$/u, '');
  }
  return out;
}
