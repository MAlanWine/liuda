import type { DemoTask, GeoPoint, Mood, PlaceArt, PositionEvidence, PostSummary, PublicAuthor } from '../api/types.ts';
import { distanceLabel, distanceMeters, isPoint } from './geo.ts';
import { gate, level, OTHER_READ_MS, PARTICIPANT_READ_MS, PREVIEW_RADIUS } from './gate.ts';

export const DOT_TEXT = '这里有人留过话，走近看看。';
export const EXPIRED_TEXT = '对话信息已过期，刷新后继续。';

/** What the server knows about a post (mock row subset). Never sent as-is. */
export type SummaryPost = GeoPoint & {
  id: string; sceneId: string; name: string; text: string; teaser: string; clue: string; hasPhoto: boolean;
  mood: Mood; art: PlaceArt | null; task: DemoTask | null; demo: boolean;
  commentCount: number; likes: number; replyParticipantCount: number; lastEngagedAt: number; createdAt: number;
};
export type SummaryContext = {
  position: PositionEvidence | null; now: number; participated: boolean;
  liked: boolean; saved: boolean; owned: boolean; author: PublicAuthor;
};

/** Server-side tiering: text, clue, photo, author and the demo task only leave the server at the tier that allows them (task: ≥ preview). */
export function summarize(post: SummaryPost, ctx: SummaryContext): PostSummary {
  const { position, now, participated } = ctx;
  const tier = level(position, post, now, participated);
  const onsite = !!position && gate(position, post, now).ok;
  const d = position ? Math.round(distanceMeters(position, post)) : null;
  const distance = d !== null && Number.isFinite(d) ? d : null;
  const readExpiresAt = participated ? now + PARTICIPANT_READ_MS
    : !position ? 0
      : position.source === 'simulated' ? now + OTHER_READ_MS
        : Math.min(now + OTHER_READ_MS, position.timestamp + 15_000);
  const base = {
    id: post.id, sceneId: post.sceneId, name: post.name, latitude: post.latitude, longitude: post.longitude, crs: 'wgs84' as const,
    distance, distanceLabel: distanceLabel(distance), participated,
    accessMode: participated ? 'participant' as const : onsite ? 'onsite' as const : 'nearby' as const,
    canInteract: onsite, canReply: participated || onsite, canLike: onsite,
    commentCount: post.commentCount, likes: post.likes, liked: ctx.liked, saved: ctx.saved, owned: ctx.owned,
    replyParticipantCount: post.replyParticipantCount, lastEngagedAt: post.lastEngagedAt, createdAt: post.createdAt,
    mood: post.mood, art: post.art, task: post.task, demo: post.demo, readExpiresAt,
  };
  if (tier === 'full') {
    return { ...base, level: 'full', displayText: post.text, teaser: post.teaser, text: post.text, clue: post.clue, hasPhoto: post.hasPhoto, author: ctx.author };
  }
  if (tier === 'preview') {
    return { ...base, level: 'preview', displayText: post.teaser, teaser: post.teaser, text: '', clue: post.clue, hasPhoto: false, author: null };
  }
  return { ...base, level: 'dot', displayText: DOT_TEXT, teaser: '', text: '', clue: '', hasPhoto: false, author: null, task: null };
}

type DistancePatch = { distance?: number | null; distanceLabel?: string };

function collapse(s: PostSummary, to: 'dot' | 'preview', extra: DistancePatch, displayText?: string): PostSummary {
  const closed = { ...s, ...extra, canInteract: false, canReply: false, canLike: false };
  if (to === 'preview') return { ...closed, level: 'preview', displayText: displayText ?? (s.teaser || '再走近一点。'), text: '', hasPhoto: false, author: null } as PostSummary;
  return { ...closed, level: 'dot', displayText: displayText ?? DOT_TEXT, teaser: '', text: '', clue: '', hasPhoto: false, author: null, task: null } as PostSummary;
}

/**
 * Client-side expiry (legacy `visible()`): the client may only tighten what the server sent, never widen it.
 * Participants: after `readExpiresAt` collapse to dot with 对话信息已过期. Others: `full` collapses when the read expired
 * or (when a position is given) the gate no longer passes; `preview` collapses to dot beyond 200 m.
 */
export function expireSummary(s: PostSummary, now: number, position?: PositionEvidence | null): PostSummary {
  const d = position && isPoint(position) ? Math.round(distanceMeters(position, s)) : null;
  const extra: DistancePatch = d !== null && Number.isFinite(d) ? { distance: d, distanceLabel: distanceLabel(d) } : {};
  if (s.participated && s.accessMode === 'participant') {
    if (now >= s.readExpiresAt) return collapse(s, 'dot', extra, EXPIRED_TEXT);
    const onsite = !!position && s.canInteract && gate(position, s, now).ok;
    return { ...s, ...extra, canReply: true, canInteract: onsite, canLike: onsite, distanceLabel: d === null ? '可离场继续' : distanceLabel(d) };
  }
  const far = d !== null && d > PREVIEW_RADIUS;
  if (s.level === 'full' && (now >= s.readExpiresAt || (position !== undefined && !gate(position, s, now).ok))) {
    return collapse(s, far ? 'dot' : 'preview', extra);
  }
  if (s.level === 'preview' && far) return collapse(s, 'dot', extra);
  return { ...s, ...extra };
}
