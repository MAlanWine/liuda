import type { AuthMethod, ChatState, DemoSettings, DemoTask, GeoPoint, Mood, PlaceArt, PositionEvidence, PresencePurpose, ReportReason, ReportTarget } from '../types.ts';
import { ApiError } from '../errors.ts';
import { THREAD_CAP } from '../../domain/text.ts';
import type { KeyValue } from './kv.ts';

export const SCHEMA = 1;
export const DOC_KEY = 'liuda-mock-backend-v1';
export const PHOTO_KEY_PREFIX = 'liuda-mock-photo-v1:';
export const CORRUPT_KEY_PREFIX = DOC_KEY + ':corrupt:';
export const CORRUPT_NOTICE = '本机演示数据无法读取，已备份并重新开始。';

export const DEFAULT_SETTINGS: Pick<DemoSettings, 'latencyMs' | 'flakyWrites' | 'simulatedUsers'> = {
  latencyMs: [120, 450], flakyWrites: false, simulatedUsers: true,
};
export const START_CREDITS = 3;

export type RateRow = { minute: number; n: number; day: number; daily: number; reportDay: number; reports: number };
export type AccountRow = {
  id: string; method: AuthMethod; nickname: string; avatar: string | null; profileSet: boolean;
  member: boolean; createdAt: number; rate: RateRow; simChatRequested: boolean;
};
export type SessionRow = { token: string; accountId: string; createdAt: number };
export type PostRow = {
  id: string; ownerId: string; sceneId: string; name: string; text: string; teaser: string; clue: string;
  latitude: number; longitude: number; photoId: string | null; mood: Mood; art: PlaceArt | null; task: DemoTask | null;
  demo: boolean; seed: boolean; state: 'active' | 'deleted'; createdAt: number; deletedAt: number | null;
  commentCount: number; likes: number; replyParticipantIds: string[]; lastEngagedAt: number;
  lastCommentAt: number | null; lastCommentOwner: string | null; importedFrom: string | null;
};
export type CommentRow = { id: string; postId: string; ownerId: string; text: string; entry: 'onsite' | 'continuation';
  state: 'active' | 'deleted'; createdAt: number; seed: boolean };
export type LikeRow = { accountId: string; postId: string; active: boolean; updatedAt: number };
export type ThreadRow = { accountId: string; postId: string; entry: 'post' | 'comment' | 'legacy' | 'seed' | 'import'; joinedAt: number };
export type TicketRow = { id: string; accountId: string; purpose: PresencePurpose; postId: string; position: PositionEvidence;
  issuedAt: number; expiresAt: number; usedAt: number };
export type OpRow = { key: string; bodyHash: string; receipt: unknown; createdAt: number };
export type PhotoRow = { id: string; accountId: string; state: 'staged' | 'attached' | 'deleted'; postId: string | null;
  position: GeoPoint; createdAt: number; bytes: number };
export type EventRow = { id: string; accountId: string; actorId: string; postId: string; commentId?: string; name: string; type: 'reply'; createdAt: number };
/** The comment behind a 回应 event (older rows only have it in their `<commentId>:<accountId>` key). */
export const eventCommentId = (e: EventRow) => e.commentId ?? e.id.slice(0, Math.max(0, e.id.lastIndexOf(':')));
export type BookmarkRow = { accountId: string; postId: string; createdAt: number };
export type ReportRow = { id: string; accountId: string; target: ReportTarget; reason: ReportReason; note: string; createdAt: number };
export type BlockRow = { id: string; accountId: string; blockedId: string; label: string; createdAt: number };
export type ChatRow = { id: string; postId: string; placeName: string; requesterId: string; authorId: string; state: ChatState;
  greeting: string; createdAt: number; updatedAt: number; lastMessageAt: number | null; messageCount: number; simReplies: number };
export type ChatMessageRow = { id: string; chatId: string; ownerId: string; text: string; createdAt: number };
export type JobKind = 'simReply' | 'simLike' | 'simChatRequest' | 'simAuthorReply' | 'simAccept' | 'simChatMessage';
export type JobRow = { id: string; due: number; kind: JobKind; postId?: string; chatId?: string; accountId?: string; actorId?: string; text?: string };

export type Doc = {
  schema: typeof SCHEMA; createdAt: number;
  settings: Pick<DemoSettings, 'latencyMs' | 'flakyWrites' | 'simulatedUsers'>;
  anchor: { point: GeoPoint; source: 'fix' | 'simulated'; provisional: boolean } | null;
  deviceGuestId: string | null;
  accounts: Record<string, AccountRow>; sessions: Record<string, SessionRow>;
  posts: Record<string, PostRow>; comments: Record<string, CommentRow>; likes: Record<string, LikeRow>;
  threads: Record<string, ThreadRow>; tickets: Record<string, TicketRow>; ops: Record<string, OpRow>;
  photos: Record<string, PhotoRow>; events: Record<string, EventRow>; bookmarks: Record<string, BookmarkRow>;
  reports: Record<string, ReportRow>; blocks: Record<string, BlockRow>; chats: Record<string, ChatRow>;
  chatMessages: Record<string, ChatMessageRow>; credits: Record<string, number>; jobs: JobRow[];
  simCounters: Record<string, number>; migratedFrom: string[];
};

const COLLECTIONS = ['accounts', 'sessions', 'posts', 'comments', 'likes', 'threads', 'tickets', 'ops', 'photos', 'events',
  'bookmarks', 'reports', 'blocks', 'chats', 'chatMessages', 'credits', 'simCounters'] as const;

export function emptyDoc(now: number): Doc {
  return {
    schema: SCHEMA, createdAt: now, settings: { ...DEFAULT_SETTINGS, latencyMs: [...DEFAULT_SETTINGS.latencyMs] }, anchor: null,
    deviceGuestId: null, accounts: {}, sessions: {}, posts: {}, comments: {}, likes: {}, threads: {}, tickets: {}, ops: {},
    photos: {}, events: {}, bookmarks: {}, reports: {}, blocks: {}, chats: {}, chatMessages: {}, credits: {}, jobs: [],
    simCounters: {}, migratedFrom: [],
  };
}

/** Wipes content but keeps accounts, sessions, settings and the legacy-import record (演示数据重置). */
export function resetContent(doc: Doc, now: number): Doc {
  const fresh = emptyDoc(now);
  fresh.settings = doc.settings;
  fresh.accounts = doc.accounts;
  fresh.sessions = doc.sessions;
  fresh.deviceGuestId = doc.deviceGuestId;
  fresh.migratedFrom = doc.migratedFrom;
  for (const account of Object.values(fresh.accounts)) account.simChatRequested = false;
  return fresh;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Shape check for a schema-1 doc. */
export function isDoc(value: unknown): value is Doc {
  if (!isRecord(value) || value.schema !== SCHEMA || typeof value.createdAt !== 'number') return false;
  if (!isRecord(value.settings) || !Array.isArray(value.jobs) || !Array.isArray(value.migratedFrom)) return false;
  return COLLECTIONS.every((name) => isRecord(value[name]));
}

/** Stepwise upgrades: migrations[n] turns a schema-n doc into schema n+1. None exist yet (schema 1 is the first). */
export const migrations: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {};

export type LoadResult = { doc: Doc; notice: string; created: boolean };

/**
 * Load rule (D-4): missing -> fresh (caller then migrates legacy data + seeds). Unparseable / unknown / newer schema ->
 * raw copy to `…:corrupt:<ts>` BEFORE a fresh doc is created, plus a notice. Older schema -> stepwise migrations.
 * User rows are never replaced by seeds.
 */
export async function loadDoc(kv: KeyValue, now: number): Promise<LoadResult> {
  const raw = await kv.getItem(DOC_KEY);
  if (raw === null) return { doc: emptyDoc(now), notice: '', created: true };
  let parsed: unknown = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  if (isRecord(parsed) && typeof parsed.schema === 'number' && parsed.schema < SCHEMA && parsed.schema >= 1) {
    let current: Record<string, unknown> | null = parsed;
    for (let v = parsed.schema; v < SCHEMA && current; v++) current = migrations[v] ? migrations[v](current) : null;
    parsed = current;
  }
  if (isDoc(parsed)) return { doc: parsed, notice: '', created: false };
  await kv.setItem(CORRUPT_KEY_PREFIX + now, raw);
  return { doc: emptyDoc(now), notice: CORRUPT_NOTICE, created: true };
}

/** Serialized write queue: each save waits for the previous one; the latest snapshot always lands last. */
export function createSaver(kv: KeyValue): (doc: Doc) => Promise<void> {
  let queue: Promise<void> = Promise.resolve();
  return (doc: Doc) => {
    const snapshot = JSON.stringify(doc);
    const next = queue.then(() => kv.setItem(DOC_KEY, snapshot));
    queue = next.catch(() => undefined);
    return next;
  };
}

const MINUTE = 60_000, DAY = 86_400_000;

/** Drops used/expired tickets >5 min, ops >7 days, staged photos >10 min. Returns photo ids whose bytes should go. */
export function prune(doc: Doc, now: number): string[] {
  for (const [id, t] of Object.entries(doc.tickets)) if (now - t.issuedAt > 5 * MINUTE) delete doc.tickets[id];
  for (const [id, op] of Object.entries(doc.ops)) if (now - op.createdAt > 7 * DAY) delete doc.ops[id];
  const gone: string[] = [];
  for (const [id, p] of Object.entries(doc.photos)) {
    if (p.state === 'staged' && now - p.createdAt > 10 * MINUTE) { delete doc.photos[id]; gone.push(id); }
  }
  return gone;
}

export const threadKey = (accountId: string, postId: string) => accountId + ':' + postId;
export const likeKey = threadKey;
export const bookmarkKey = threadKey;

// ---- Row-level mutations shared by the server and the simulation ----

export function grantThread(doc: Doc, accountId: string, postId: string, entry: ThreadRow['entry'], at: number): void {
  const key = threadKey(accountId, postId);
  if (!doc.threads[key]) doc.threads[key] = { accountId, postId, entry, joinedAt: at };
}

/** Participation comes only from stored rows: thread row, ownership, or an on-site (non-continuation) own comment (backfilled). */
export function isParticipant(doc: Doc, accountId: string, post: PostRow): boolean {
  if (doc.threads[threadKey(accountId, post.id)]) return true;
  if (post.ownerId === accountId) { grantThread(doc, accountId, post.id, 'post', post.createdAt); return true; }
  const proof = Object.values(doc.comments).find((c) => c.postId === post.id && c.ownerId === accountId && c.state === 'active' && c.entry !== 'continuation');
  if (!proof) return false;
  grantThread(doc, accountId, post.id, 'legacy', proof.createdAt);
  return true;
}

export function isBlockedBetween(doc: Doc, a: string, b: string): boolean {
  return Object.values(doc.blocks).some((x) => (x.accountId === a && x.blockedId === b) || (x.accountId === b && x.blockedId === a));
}

/**
 * Stores a reply and updates heat inputs: a new distinct non-author replier bumps replyParticipantIds and lastEngagedAt.
 * Creates a 回应 event for the author and every other participant except the actor.
 */
export function addComment(doc: Doc, post: PostRow, ownerId: string, text: string, entry: CommentRow['entry'], at: number, id: string): CommentRow {
  if (post.commentCount >= THREAD_CAP) throw new ApiError('THREAD_FULL');
  const row: CommentRow = { id, postId: post.id, ownerId, text, entry, state: 'active', createdAt: at, seed: false };
  doc.comments[id] = row;
  post.commentCount += 1;
  post.lastCommentAt = at;
  post.lastCommentOwner = ownerId;
  if (post.ownerId !== ownerId && !post.replyParticipantIds.includes(ownerId)) {
    post.replyParticipantIds.push(ownerId);
    post.lastEngagedAt = at;
  }
  const recipients = new Set<string>([post.ownerId]);
  for (const t of Object.values(doc.threads)) if (t.postId === post.id) recipients.add(t.accountId);
  recipients.delete(ownerId);
  for (const accountId of recipients) {
    const eventId = id + ':' + accountId;
    doc.events[eventId] = { id: eventId, accountId, actorId: ownerId, postId: post.id, commentId: id, name: post.name, type: 'reply', createdAt: at };
  }
  return row;
}

/** Unique per account; toggling never touches lastEngagedAt. Returns the new state. */
export function setLike(doc: Doc, accountId: string, post: PostRow, desired: boolean, at: number): boolean {
  const key = likeKey(accountId, post.id);
  const was = !!doc.likes[key]?.active;
  if (was !== desired) {
    doc.likes[key] = { accountId, postId: post.id, active: desired, updatedAt: at };
    post.likes = Math.max(0, post.likes + (desired ? 1 : -1));
  }
  return desired;
}

export function addChatMessage(doc: Doc, chat: ChatRow, ownerId: string, text: string, at: number, id: string): ChatMessageRow {
  const row: ChatMessageRow = { id, chatId: chat.id, ownerId, text, createdAt: at };
  doc.chatMessages[id] = row;
  chat.messageCount += 1;
  chat.lastMessageAt = at;
  chat.updatedAt = at;
  return row;
}

export function creditsOf(doc: Doc, accountId: string): number {
  return accountId.startsWith('sim-') ? Infinity : doc.credits[accountId] ?? START_CREDITS;
}
