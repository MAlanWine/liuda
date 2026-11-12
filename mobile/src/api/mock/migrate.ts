import type { Mood } from '../types.ts';
import { isPoint } from '../../domain/geo.ts';
import { hashString } from '../../domain/ids.ts';
import { CLUE_MAX, NAME_MAX, TEXT_MAX, teaserOf } from '../../domain/text.ts';
import { bookmarkKey, grantThread, type Doc, type PostRow } from './db.ts';
import type { KeyValue } from './kv.ts';

/** Pre-API RN demo store (`state/places.tsx`). Read only — the old key is never written or removed. */
export const LEGACY_PLACES_KEY = 'liuda-mobile-demo-v1';
const LEGACY_SEEDS: Record<string, string> = { bench: 'seed-bench', stairs: 'seed-stairs', corner: 'seed-corner' };

type LegacyReply = { id?: unknown; text?: unknown; mine?: unknown };
type LegacyPlace = { id?: unknown; name?: unknown; location?: unknown; text?: unknown; mood?: unknown; likes?: unknown;
  owned?: unknown; point?: unknown; replies?: unknown };

const clip = (value: unknown, max: number) => (typeof value === 'string' ? Array.from(value.trim()).slice(0, max).join('') : '');
const safeId = (value: string) => value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60) || hashString(value);

/** `local-<ts>-…` / `<ts>-…` -> ts when plausible, else `fallback`. */
export function timeFromId(id: string, fallback: number): number {
  const match = /^(?:local-)?(\d{12,14})(?:[-.]|$)/.exec(id);
  const ts = match ? Number(match[1]) : NaN;
  return Number.isFinite(ts) && ts > 1_500_000_000_000 && ts <= fallback ? ts : fallback;
}

/**
 * Legacy import: owned places with a point -> my posts; their `mine` replies -> my comments; `mine` replies on the
 * old bench/stairs/corner seeds -> comments on seed-bench/seed-stairs/seed-corner (+ thread rows); `saved` -> bookmarks.
 * Point-less demo places are dropped. Returns true when something was read (recorded in `migratedFrom`).
 */
export async function importLegacy(doc: Doc, kv: KeyValue, accountId: string, now: number): Promise<boolean> {
  if (doc.migratedFrom.includes(LEGACY_PLACES_KEY)) return false;
  let raw: string | null = null;
  try { raw = await kv.getItem(LEGACY_PLACES_KEY); } catch { raw = null; }
  if (!raw) return false;
  let state: { places?: unknown; saved?: unknown } | null = null;
  try { state = JSON.parse(raw); } catch { state = null; }
  if (!state || !Array.isArray(state.places)) return false;
  const idMap = new Map<string, string>(Object.entries(LEGACY_SEEDS));
  for (const item of state.places as LegacyPlace[]) {
    if (!item || typeof item.id !== 'string') continue;
    const replies = (Array.isArray(item.replies) ? item.replies : []) as LegacyReply[];
    const mine = replies.filter((r) => r && r.mine === true && typeof r.text === 'string' && r.text.trim());
    let postId: string | null = null;
    if (item.owned === true && isPoint(item.point)) {
      const text = clip(item.text, TEXT_MAX), name = clip(item.name, NAME_MAX) || '现场留话';
      if (!text) continue;
      postId = 'import-' + safeId(item.id);
      const createdAt = timeFromId(item.id, now);
      const mood: Mood = item.mood === 'sand' || item.mood === 'blue' ? item.mood : 'sage';
      const post: PostRow = {
        id: postId, ownerId: accountId, sceneId: 'scene-' + postId, name, text, teaser: teaserOf(text), clue: clip(item.location, CLUE_MAX),
        latitude: item.point.latitude, longitude: item.point.longitude, photoId: null, mood, art: null, task: null, demo: false, seed: false,
        state: 'active', createdAt, deletedAt: null, commentCount: 0,
        likes: typeof item.likes === 'number' && Number.isFinite(item.likes) ? Math.max(0, Math.floor(item.likes)) : 0,
        replyParticipantIds: [], lastEngagedAt: createdAt, lastCommentAt: null, lastCommentOwner: null, importedFrom: item.id,
      };
      if (!doc.posts[postId]) doc.posts[postId] = post;
      grantThread(doc, accountId, postId, 'import', createdAt);
    } else if (LEGACY_SEEDS[item.id]) {
      postId = LEGACY_SEEDS[item.id];
      if (mine.length) grantThread(doc, accountId, postId, 'import', now);
    }
    if (!postId) continue;
    idMap.set(item.id, postId);
    const post = doc.posts[postId];
    for (const reply of mine) {
      const rid = typeof reply.id === 'string' ? reply.id : hashString(String(reply.text));
      const id = 'import-' + safeId(postId + '-' + rid);
      if (doc.comments[id]) continue;
      const createdAt = timeFromId(rid, now);
      doc.comments[id] = { id, postId, ownerId: accountId, text: clip(reply.text, TEXT_MAX), entry: 'onsite', state: 'active', createdAt, seed: false };
      if (post) { post.commentCount += 1; post.lastCommentAt = Math.max(post.lastCommentAt ?? 0, createdAt); post.lastCommentOwner = accountId; }
    }
  }
  if (Array.isArray(state.saved)) {
    for (const old of state.saved) {
      const postId = typeof old === 'string' ? idMap.get(old) : undefined;
      if (postId) doc.bookmarks[bookmarkKey(accountId, postId)] = { accountId, postId, createdAt: now };
    }
  }
  doc.migratedFrom.push(LEGACY_PLACES_KEY);
  return true;
}
