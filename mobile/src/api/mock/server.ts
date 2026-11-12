// In-app mock backend (演示). Implements the §2 contract and §2.1 rules on top of one JSON doc in a KeyValue store.
import { isApiAction } from '../client.ts';
import { ApiError } from '../errors.ts';
import type {
  ApiAction, ApiActions, ApiEnvelope, Transport, AuthMethod, ChatMeta, ChatMessage, Comment, DemoSettings, InboxEvent, Mood,
  PositionEvidence, PostSummary, PresencePurpose, PublicAuthor, ReportReason, ReportTarget, ThreadMeta,
} from '../types.ts';
import { normalizeProfile } from '../../state/profile-data.ts';
import { gate, isPositionEvidence, checkPosition, level, TICKET_TTL_MS, NEARBY_RADIUS } from '../../domain/gate.ts';
import { distanceMeters, isPoint } from '../../domain/geo.ts';
import { hashString, isRequestId, newId, randomHex, type Random } from '../../domain/ids.ts';
import { summarize } from '../../domain/tiers.ts';
import {
  CHAT_MESSAGE_CAP, CHAT_TEXT_MAX, CLUE_MAX, GREETING_MAX, NAME_MAX, POST_CAP, REPORT_NOTE_MAX, TEXT_MAX, teaserOf, validateText,
} from '../../domain/text.ts';
import {
  addChatMessage, addComment, bookmarkKey, createSaver, creditsOf, eventCommentId, grantThread, isBlockedBetween, isParticipant, likeKey, loadDoc,
  PHOTO_KEY_PREFIX, prune, resetContent, setLike, START_CREDITS,
  type AccountRow, type ChatRow, type Doc, type PostRow,
} from './db.ts';
import type { KeyValue } from './kv.ts';
import { importLegacy } from './migrate.ts';
import { checkPhoto, checkText } from './moderation.ts';
import { DEFAULT_ORIGIN, hasSeeds, insertSeeds, INTRO_POST_ID, isSimUser, reanchorSeeds } from './seed.ts';
import { afterChatRequest, afterMyChatMessage, afterMyPost, afterMyReply, runDue } from './simulation.ts';

/** Idempotent (`requestId`) writes — the ones flaky mode may "lose" after commit. */
export const WRITE_ACTIONS: ReadonlySet<ApiAction> = new Set<ApiAction>([
  'post', 'comment', 'continueComment', 'like', 'uploadPhoto', 'delete', 'report', 'block',
  'requestChat', 'respondChat', 'cancelChat', 'sendChat', 'destroyChat',
]);
const OPEN_ACTIONS: ReadonlySet<ApiAction> = new Set<ApiAction>(['signIn', 'signOut']);
const NON_MEMBER_ACTIONS: ReadonlySet<ApiAction> = new Set<ApiAction>(['status', 'join', 'me', 'updateProfile']);

export const DEMO_INVITE_CODE = 'LIUDA-DEMO';
/** Shown to the author who accepts while the requester has no 演示权益 left (the request stays pending). */
export const AUTHOR_NO_ENTITLEMENT = '对方的演示权益已用完，申请会继续等待。';
export const ACCOUNT_LABELS: Record<AuthMethod, string> = { wechat: '微信（演示账号）', apple: 'Apple（演示账号）', guest: '本机游客（演示）' };
const MOODS: readonly Mood[] = ['sage', 'sand', 'blue'];
const PURPOSES: readonly PresencePurpose[] = ['post', 'comment', 'like', 'photo', 'chat'];
const REASONS: readonly ReportReason[] = ['spam', 'abuse', 'privacy', 'illegal', 'other'];
const MINUTE = 60_000, DAY = 86_400_000, PHOTO_TTL = 10 * MINUTE;
const WRITES_PER_MINUTE = 15, WRITES_PER_DAY = 150, REPORTS_PER_DAY = 20;
/** Idempotency namespaces whose receipts carry a chat (ChatMeta with greeting, or a ChatMessage with text). */
const CHAT_OP_NAMESPACES: ReadonlySet<string> = new Set(['chat', 'respondChat', 'cancelChat', 'sendChat', 'destroyChat']);
/** Opaque, stable per-account key for client-side marks (e.g. inbox seen). Not the account id. */
export const accountKeyOf = (accountId: string) => 'k-' + hashString('account-key:' + accountId);

export type MockServer = {
  handle(action: string, payload: unknown, token: string | null): Promise<ApiEnvelope<unknown>>;
  /** Current demo settings without auth (used by the transport for latency / flaky mode). */
  settings(): Promise<DemoSettings>;
  /** One-shot notice (e.g. corrupt doc backed up); '' when none. */
  notice(): string;
  /** Test/debug access to the live doc (null before the first call). */
  peek(): Doc | null;
};
export type MockServerOptions = { kv: KeyValue; clock?: () => number; random?: Random };

type Payload = Record<string, unknown>;
type Ctx = {
  doc: Doc; now: number; p: Payload; token: string | null; account: AccountRow | null;
  photoWrites: [string, string][]; photoDeletes: string[]; replaceDoc(next: Doc): void;
};
type Handlers = { [K in ApiAction]: (c: Ctx) => ApiActions[K]['res'] | Promise<ApiActions[K]['res']> };

const fail = (code: ConstructorParameters<typeof ApiError>[0], message?: string): never => { throw new ApiError(code, message); };
const isRecord = (v: unknown): v is Payload => !!v && typeof v === 'object' && !Array.isArray(v);
const idOf = (v: unknown, code: 'POST_MISSING' | 'CHAT_MISSING' = 'POST_MISSING') => (typeof v === 'string' && v.length > 0 && v.length <= 120 ? v : fail(code));

export function createMockServer(options: MockServerOptions): MockServer {
  const { kv } = options;
  const clock = options.clock ?? Date.now;
  const random = options.random ?? Math.random;
  const save = createSaver(kv);
  let doc: Doc | null = null;
  /** JSON of the doc as last written to (or read from) storage; a failed save rolls the live doc back to it. */
  let persisted = '';
  let pendingNotice = '';
  let lock: Promise<unknown> = Promise.resolve();

  async function ensure(now: number): Promise<Doc> {
    if (doc) return doc;
    const loaded = await loadDoc(kv, now);
    pendingNotice = loaded.notice;
    const fresh = loaded.doc;
    if (loaded.created) {
      const guest = createAccount(fresh, 'guest', now);
      fresh.deviceGuestId = guest.id;
      await importLegacy(fresh, kv, guest.id, now);
      await save(fresh);
    }
    persisted = JSON.stringify(fresh);
    doc = fresh;
    return fresh;
  }

  function createAccount(d: Doc, method: AuthMethod, now: number): AccountRow {
    const account: AccountRow = {
      id: newId('acct', random, now), method, nickname: '路过的人', avatar: null, profileSet: false, member: true, createdAt: now,
      rate: { minute: 0, n: 0, day: 0, daily: 0, reportDay: 0, reports: 0 }, simChatRequested: false,
    };
    d.accounts[account.id] = account;
    d.credits[account.id] = START_CREDITS;
    return account;
  }

  // ---------- helpers ----------
  const me = (c: Ctx): AccountRow => c.account ?? fail('AUTH_REQUIRED');

  function readPosition(raw: unknown, now: number): PositionEvidence {
    if (raw === undefined || raw === null) return fail('LOCATION_REQUIRED');
    if (!isPositionEvidence(raw)) return fail('INVALID_LOCATION');
    const pos: PositionEvidence = { latitude: raw.latitude, longitude: raw.longitude, crs: 'wgs84', accuracy: raw.accuracy, timestamp: raw.timestamp, source: raw.source };
    if (pos.source === 'gps') {
      const usable = checkPosition(pos, now);
      if (!usable.ok && usable.code === 'STALE_LOCATION') fail('STALE_LOCATION');
      if (pos.accuracy === null || !Number.isFinite(pos.accuracy) || pos.accuracy <= 0) fail('WEAK_LOCATION');
    }
    return pos;
  }
  function optionalPosition(raw: unknown, now: number): PositionEvidence | null {
    if (raw === undefined || raw === null) return null;
    try { return readPosition(raw, now); } catch { return null; }
  }
  function requireGate(pos: PositionEvidence, target: { latitude: number; longitude: number }, now: number): void {
    const result = gate(pos, target, now);
    if (!result.ok) fail(result.code);
  }

  const reported = (d: Doc, accountId: string, test: (t: ReportTarget) => boolean) =>
    Object.values(d.reports).some((r) => r.accountId === accountId && test(r.target));
  const iBlocked = (d: Doc, accountId: string, other: string) =>
    Object.values(d.blocks).some((b) => b.accountId === accountId && b.blockedId === other);
  const postHidden = (d: Doc, accountId: string, post: PostRow) =>
    iBlocked(d, accountId, post.ownerId) || reported(d, accountId, (t) => t.kind === 'post' && t.postId === post.id);

  function visiblePost(c: Ctx, raw: unknown): PostRow {
    const post = c.doc.posts[idOf(raw)];
    if (!post || post.state !== 'active' || postHidden(c.doc, me(c).id, post)) fail('POST_MISSING');
    return post as PostRow;
  }

  /**
   * Public anonymity: everyone else is their per-thread alias `路人 XXXX` (the post author too, flagged `isOriginalPoster`
   * so the client adds the 楼主 badge); avatar null. Own items carry the caller's profile.
   */
  function authorOf(d: Doc, viewer: AccountRow, post: { id: string; ownerId: string }, ownerId: string): PublicAuthor {
    const isOriginalPoster = ownerId === post.ownerId;
    if (ownerId === viewer.id) return { nickname: viewer.nickname, avatar: viewer.avatar, isMe: true, isOriginalPoster, simulated: false };
    const nickname = '路人 ' + hashString(post.id + ':' + ownerId).slice(0, 4).toUpperCase();
    return { nickname, avatar: null, isMe: false, isOriginalPoster, simulated: isSimUser(ownerId) };
  }

  function summaryFor(c: Ctx, post: PostRow, position: PositionEvidence | null): PostSummary {
    const viewer = me(c), d = c.doc;
    const photo = post.photoId ? d.photos[post.photoId] : undefined;
    return summarize({ ...post, replyParticipantCount: post.replyParticipantIds.length, hasPhoto: !!photo && photo.state === 'attached' }, {
      position, now: c.now, participated: isParticipant(d, viewer.id, post),
      liked: !!d.likes[likeKey(viewer.id, post.id)]?.active, saved: !!d.bookmarks[bookmarkKey(viewer.id, post.id)],
      owned: post.ownerId === viewer.id, author: authorOf(d, viewer, post, post.ownerId),
    });
  }

  function rateWrite(account: AccountRow, now: number): void {
    const minute = Math.floor(now / MINUTE), day = Math.floor(now / DAY), r = account.rate;
    const n = r.minute === minute ? r.n : 0, daily = r.day === day ? r.daily : 0;
    if (n >= WRITES_PER_MINUTE || daily >= WRITES_PER_DAY) fail('TOO_FAST');
    account.rate = { ...r, minute, n: n + 1, day, daily: daily + 1 };
  }

  /** Same account + namespace + requestId: same body -> stored receipt, different body -> REQUEST_CONFLICT. */
  function idempotent<T>(c: Ctx, namespace: string, body: string, run: () => T): T {
    const account = me(c);
    if (!isRequestId(c.p.requestId)) fail('INVALID_INPUT', '请求编号不正确。');
    const key = account.id + ':' + namespace + ':' + (c.p.requestId as string);
    const bodyHash = hashString(body);
    const previous = c.doc.ops[key];
    if (previous) {
      if (previous.bodyHash !== bodyHash) fail('REQUEST_CONFLICT');
      return previous.receipt as T;
    }
    rateWrite(account, c.now);
    const receipt = run();
    c.doc.ops[key] = { key, bodyHash, receipt, createdAt: c.now };
    return receipt;
  }

  function useTicket(c: Ctx, purpose: PresencePurpose, postId: string, position: PositionEvidence): void {
    const raw = c.p.ticket;
    const t = typeof raw === 'string' && /^[a-f0-9]{48}$/.test(raw) ? c.doc.tickets[raw] : undefined;
    if (!t || t.accountId !== me(c).id || t.usedAt || t.expiresAt < c.now || t.purpose !== purpose || t.postId !== postId) fail('PRESENCE_EXPIRED');
    if (distanceMeters(position, t!.position) > 50) fail('NOT_ONSITE', '位置已发生较大变化，请重新操作。');
    t!.usedAt = c.now;
  }

  function moderate(text: string): void {
    if (!checkText(text)) fail('CONTENT_REJECTED');
  }

  function threadMeta(c: Ctx, post: PostRow): ThreadMeta {
    return { id: post.id, name: post.name, owned: post.ownerId === me(c).id, participated: true, commentCount: post.commentCount,
      createdAt: post.createdAt, updatedAt: post.lastCommentAt ?? post.createdAt };
  }

  function conversationPosts(c: Ctx): { all: PostRow[]; own: PostRow[] } {
    const viewer = me(c), d = c.doc;
    const ids = new Set<string>();
    for (const t of Object.values(d.threads)) if (t.accountId === viewer.id) ids.add(t.postId);
    for (const cm of Object.values(d.comments)) if (cm.ownerId === viewer.id && cm.entry !== 'continuation') ids.add(cm.postId);
    for (const p of Object.values(d.posts)) if (p.ownerId === viewer.id) ids.add(p.id);
    const all = Array.from(ids).map((id) => d.posts[id])
      .filter((p): p is PostRow => !!p && p.state === 'active' && !postHidden(d, viewer.id, p) && isParticipant(d, viewer.id, p))
      .sort((a, b) => (b.lastCommentAt ?? b.createdAt) - (a.lastCommentAt ?? a.createdAt)).slice(0, 50);
    const own = Object.values(d.posts).filter((p) => p.ownerId === viewer.id && p.state === 'active')
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
    return { all, own };
  }

  function events(c: Ctx, posts: PostRow[]): InboxEvent[] {
    const viewer = me(c), d = c.doc, allowed = new Set(posts.map((p) => p.id));
    const latest = new Map<string, InboxEvent>();
    const reportedComment = (commentId: string) => reported(d, viewer.id, (t) => t.kind === 'comment' && t.commentId === commentId);
    const rows = Object.values(d.events).filter((e) => e.accountId === viewer.id && e.actorId !== viewer.id && allowed.has(e.postId)
      && !iBlocked(d, viewer.id, e.actorId) && !reportedComment(eventCommentId(e)))
      .sort((a, b) => b.createdAt - a.createdAt);
    // Public id: opaque hash of (comment, recipient) — never the internal row key, which embeds the account id.
    for (const e of rows) if (!latest.has(e.postId)) latest.set(e.postId, { id: 'evt-' + hashString('event:' + e.id), postId: e.postId, name: e.name, type: 'reply', createdAt: e.createdAt });
    return Array.from(latest.values()).slice(0, 20);
  }

  function myChat(c: Ctx, raw: unknown): ChatRow {
    const chat = c.doc.chats[idOf(raw, 'CHAT_MISSING')], viewer = me(c);
    if (!chat || (chat.requesterId !== viewer.id && chat.authorId !== viewer.id)) fail('CHAT_MISSING');
    return chat as ChatRow;
  }
  const chatHidden = (c: Ctx, chat: ChatRow) => reported(c.doc, me(c).id, (t) => t.kind === 'chat' && t.chatId === chat.id && !t.messageId);

  function chatMeta(c: Ctx, chat: ChatRow): ChatMeta {
    const viewer = me(c), role = chat.requesterId === viewer.id ? 'requester' : 'author';
    const peerId = role === 'requester' ? chat.authorId : chat.requesterId;
    return { id: chat.id, postId: chat.postId, placeName: chat.placeName, state: chat.state, role,
      peer: authorOf(c.doc, viewer, { id: chat.postId, ownerId: chat.authorId }, peerId), greeting: chat.greeting,
      createdAt: chat.createdAt, updatedAt: chat.updatedAt, lastMessageAt: chat.lastMessageAt };
  }

  function listChats(c: Ctx): ChatMeta[] {
    const viewer = me(c);
    return Object.values(c.doc.chats).filter((x) => (x.requesterId === viewer.id || x.authorId === viewer.id) && !chatHidden(c, x))
      .sort((a, b) => b.updatedAt - a.updatedAt).map((x) => chatMeta(c, x));
  }

  function settingsOf(d: Doc): DemoSettings {
    return { latencyMs: [d.settings.latencyMs[0], d.settings.latencyMs[1]], flakyWrites: d.settings.flakyWrites, simulatedUsers: d.settings.simulatedUsers,
      anchor: d.anchor ? { ...d.anchor.point } : null, anchorSource: d.anchor ? d.anchor.source : null };
  }

  function parseTarget(raw: unknown): ReportTarget {
    if (!isRecord(raw)) return fail('INVALID_INPUT', '举报对象不正确。');
    if (raw.kind === 'post') return { kind: 'post', postId: idOf(raw.postId) };
    if (raw.kind === 'comment') return { kind: 'comment', postId: idOf(raw.postId), commentId: idOf(raw.commentId) };
    if (raw.kind === 'chat') {
      const messageId = typeof raw.messageId === 'string' && raw.messageId ? raw.messageId : undefined;
      return messageId ? { kind: 'chat', chatId: idOf(raw.chatId, 'CHAT_MISSING'), messageId } : { kind: 'chat', chatId: idOf(raw.chatId, 'CHAT_MISSING') };
    }
    return fail('INVALID_INPUT', '举报对象不正确。');
  }

  /** Resolves a target to its author (server-side only) and a place name for the block label. */
  function resolveTarget(c: Ctx, target: ReportTarget): { ownerId: string; placeName: string } {
    const d = c.doc;
    if (target.kind === 'chat') {
      const chat = myChat(c, target.chatId);
      if (target.messageId) {
        const message = d.chatMessages[target.messageId];
        if (!message || message.chatId !== chat.id) fail('CHAT_MISSING');
        return { ownerId: message!.ownerId, placeName: chat.placeName };
      }
      return { ownerId: chat.requesterId === me(c).id ? chat.authorId : chat.requesterId, placeName: chat.placeName };
    }
    const post = d.posts[target.postId];
    if (!post || post.state !== 'active') return fail('POST_MISSING');
    if (target.kind === 'post') return { ownerId: post.ownerId, placeName: post.name };
    const comment = d.comments[target.commentId];
    if (!comment || comment.postId !== post.id || comment.state !== 'active') return fail('POST_MISSING');
    return { ownerId: comment.ownerId, placeName: post.name };
  }

  function onsiteText(c: Ctx, field: string, max: number, name = 'text'): string {
    return validateText(c.p[name], max, field);
  }

  /** Rule 9: once a chat is destroyed no stored receipt may keep its greeting or message text (any account's). */
  function scrubChatOps(d: Doc, chatId: string): void {
    for (const [key, op] of Object.entries(d.ops)) {
      const namespace = key.split(':')[1] ?? '';
      const receipt = isRecord(op.receipt) ? op.receipt : null;
      if (CHAT_OP_NAMESPACES.has(namespace) && receipt && (receipt.chatId === chatId || receipt.id === chatId)) delete d.ops[key];
    }
  }

  /** A post can only be blocked by someone who can at least see its preview (participants always can). */
  function requirePreview(c: Ctx, postId: string): void {
    const viewer = me(c), d = c.doc, post = d.posts[postId];
    if (!post || post.state !== 'active' || isParticipant(d, viewer.id, post)) return;
    if (level(optionalPosition(c.p.position, c.now), post, c.now, false) === 'dot') fail('FORBIDDEN', '走近到能看到预览后才能屏蔽。');
  }

  // ---------- actions ----------
  const handlers: Handlers = {
    signIn(c) {
      const method = c.p.method;
      if (method !== 'guest' && method !== 'wechat' && method !== 'apple') return fail('INVALID_INPUT', '登录方式不正确。');
      const d = c.doc, current = c.account;
      let account: AccountRow | undefined;
      let created = false;
      if (method === 'guest') {
        account = d.deviceGuestId ? d.accounts[d.deviceGuestId] : undefined;
        if (!account) { account = createAccount(d, 'guest', c.now); d.deviceGuestId = account.id; created = true; }
      } else {
        account = Object.values(d.accounts).find((a) => a.method === method);
        if (!account && current && current.method === 'guest') {
          account = current;
          account.method = method;
          if (d.deviceGuestId === account.id) d.deviceGuestId = null;
        }
        if (!account) { account = createAccount(d, method, c.now); created = true; }
      }
      if (isRecord(c.p.profile) && (created || !account.profileSet)) {
        try {
          const profile = normalizeProfile({ nickname: String(c.p.profile.nickname ?? ''), avatar: (c.p.profile.avatar ?? null) as string | null });
          account.nickname = profile.nickname;
          account.avatar = profile.avatar;
          account.profileSet = true;
        } catch { /* an unusable legacy profile never blocks sign-in */ }
      }
      if (c.token) delete d.sessions[c.token];
      const token = 'mock-' + randomHex(40, random);
      d.sessions[token] = { token, accountId: account.id, createdAt: c.now };
      return { token, method: account.method, accountLabel: ACCOUNT_LABELS[account.method], accountKey: accountKeyOf(account.id), createdAt: c.now, mock: true };
    },
    signOut(c) {
      if (c.token) delete c.doc.sessions[c.token];
      return { signedOut: true };
    },
    status(c) {
      const a = me(c);
      return { protocol: 2, member: a.member, method: a.method, mock: true, accountKey: accountKeyOf(a.id) };
    },
    join(c) {
      const a = me(c);
      if (c.p.inviteCode !== DEMO_INVITE_CODE) fail('INVITE_INVALID');
      a.member = true;
      return { joined: true, protocol: 2 };
    },
    me(c) {
      const a = me(c);
      return { profile: { nickname: a.nickname, avatar: a.avatar }, method: a.method, createdAt: a.createdAt };
    },
    updateProfile(c) {
      const a = me(c);
      let profile;
      try {
        profile = normalizeProfile({ nickname: typeof c.p.nickname === 'string' ? c.p.nickname : '', avatar: (c.p.avatar ?? null) as string | null });
      } catch (error) {
        return fail('INVALID_INPUT', error instanceof Error ? error.message : undefined);
      }
      a.nickname = profile.nickname;
      a.avatar = profile.avatar;
      a.profileSet = true;
      return { profile: { nickname: a.nickname, avatar: a.avatar } };
    },
    nearby(c) {
      const viewer = me(c), d = c.doc, pos = readPosition(c.p.position, c.now);
      const source = pos.source === 'gps' ? 'fix' : 'simulated';
      if (!hasSeeds(d)) insertSeeds(d, pos, source, false, viewer.id, c.now);
      else if (d.anchor?.provisional) reanchorSeeds(d, pos, source);
      const near = Object.values(d.posts)
        .filter((p) => p.state === 'active' && !postHidden(d, viewer.id, p))
        .map((p) => ({ p, distance: distanceMeters(pos, p) }))
        .filter((x) => x.distance <= NEARBY_RADIUS)
        .sort((a, b) => a.distance - b.distance || (a.p.id < b.p.id ? -1 : 1));
      return { posts: near.slice(0, 50).map((x) => summaryFor(c, x.p, pos)), limited: near.length > 50 };
    },
    thread(c) {
      const viewer = me(c), d = c.doc, post = visiblePost(c, c.p.postId);
      const participated = isParticipant(d, viewer.id, post);
      const pos = participated ? optionalPosition(c.p.position, c.now) : readPosition(c.p.position, c.now);
      const summary = summaryFor(c, post, pos);
      if (summary.level !== 'full') return { post: summary, comments: [] };
      const comments: Comment[] = Object.values(d.comments)
        .filter((cm) => cm.postId === post.id && cm.state === 'active' && !iBlocked(d, viewer.id, cm.ownerId)
          && !reported(d, viewer.id, (t) => t.kind === 'comment' && t.commentId === cm.id))
        .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)).slice(0, 100)
        .map((cm) => ({ id: cm.id, text: cm.text, author: authorOf(d, viewer, post, cm.ownerId), mine: cm.ownerId === viewer.id,
          entry: cm.entry === 'continuation' ? 'continuation' : 'onsite', createdAt: cm.createdAt }));
      return { post: summary, comments };
    },
    presence(c) {
      const viewer = me(c), purpose = c.p.purpose as PresencePurpose;
      if (!PURPOSES.includes(purpose)) return fail('INVALID_INPUT', '操作类型不正确。');
      const pos = readPosition(c.p.position, c.now);
      let postId = '';
      if (purpose === 'post' || purpose === 'photo') requireGate(pos, pos, c.now);
      else { const post = visiblePost(c, c.p.postId); requireGate(pos, post, c.now); postId = post.id; }
      const ticket = randomHex(48, random);
      c.doc.tickets[ticket] = { id: ticket, accountId: viewer.id, purpose, postId, position: pos, issuedAt: c.now, expiresAt: c.now + TICKET_TTL_MS, usedAt: 0 };
      return { ticket, expiresAt: c.now + TICKET_TTL_MS };
    },
    post(c) {
      const text = onsiteText(c, '留话', TEXT_MAX), name = onsiteText(c, '地点名称', NAME_MAX, 'name');
      const clue = c.p.clue === undefined || c.p.clue === null || c.p.clue === '' ? '' : validateText(c.p.clue, CLUE_MAX, '线索');
      const sceneId = typeof c.p.sceneId === 'string' ? c.p.sceneId : '';
      const photoId = typeof c.p.photoId === 'string' ? c.p.photoId : '';
      return idempotent(c, 'post', JSON.stringify({ text, name, clue, sceneId, photoId }), () => {
        const viewer = me(c), d = c.doc, pos = readPosition(c.p.position, c.now);
        requireGate(pos, pos, c.now);
        useTicket(c, 'post', '', pos);
        moderate(name + '\n' + text + '\n' + clue);
        if (Object.values(d.posts).filter((p) => p.ownerId === viewer.id && p.state === 'active').length >= POST_CAP) fail('POST_LIMIT');
        let place = { latitude: pos.latitude, longitude: pos.longitude }, placeName = name, scene = '';
        if (sceneId) {
          const base = Object.values(d.posts).find((p) => p.sceneId === sceneId && p.state === 'active' && !postHidden(d, viewer.id, p));
          if (!base) fail('INVALID_INPUT', '地点已不可用。');
          requireGate(pos, base!, c.now);
          place = { latitude: base!.latitude, longitude: base!.longitude }; placeName = base!.name; scene = sceneId;
        }
        const id = newId('post', random, c.now);
        if (photoId) {
          const photo = d.photos[photoId];
          if (!photo || photo.accountId !== viewer.id || photo.state !== 'staged' || c.now - photo.createdAt > PHOTO_TTL) fail('PHOTO_EXPIRED');
          if (distanceMeters(pos, photo!.position) > 50) fail('NOT_ONSITE');
          photo!.state = 'attached';
          photo!.postId = id;
        }
        const post: PostRow = {
          id, ownerId: viewer.id, sceneId: scene || newId('scene', random, c.now), name: placeName, text, teaser: teaserOf(text), clue,
          latitude: place.latitude, longitude: place.longitude, photoId: photoId || null,
          mood: MOODS[parseInt(hashString(id).slice(0, 8), 16) % 3], art: null, task: null, demo: false, seed: false,
          state: 'active', createdAt: c.now, deletedAt: null, commentCount: 0, likes: 0, replyParticipantIds: [],
          lastEngagedAt: c.now, lastCommentAt: null, lastCommentOwner: null, importedFrom: null,
        };
        d.posts[id] = post;
        grantThread(d, viewer.id, id, 'post', c.now);
        afterMyPost(d, post, viewer.id, c.now, random);
        return { id, createdAt: c.now };
      });
    },
    comment(c) {
      const postId = idOf(c.p.postId), text = onsiteText(c, '回复', TEXT_MAX);
      return idempotent(c, 'comment', postId + ':' + text, () => {
        const viewer = me(c), d = c.doc, post = visiblePost(c, postId), pos = readPosition(c.p.position, c.now);
        requireGate(pos, post, c.now);
        useTicket(c, 'comment', post.id, pos);
        moderate(text);
        const row = addComment(d, post, viewer.id, text, 'onsite', c.now, newId('cmt', random, c.now));
        grantThread(d, viewer.id, post.id, 'comment', c.now);
        afterMyReply(d, post, c.now, random);
        return { id: row.id, postId: post.id, createdAt: c.now, participated: true as const };
      });
    },
    continueComment(c) {
      const postId = idOf(c.p.postId), text = onsiteText(c, '回复', TEXT_MAX);
      return idempotent(c, 'comment', postId + ':' + text, () => {
        const viewer = me(c), d = c.doc, post = visiblePost(c, postId);
        if (!isParticipant(d, viewer.id, post)) fail('PARTICIPATION_REQUIRED');
        moderate(text);
        const row = addComment(d, post, viewer.id, text, 'continuation', c.now, newId('cmt', random, c.now));
        afterMyReply(d, post, c.now, random);
        return { id: row.id, postId: post.id, createdAt: c.now, participated: true as const };
      });
    },
    like(c) {
      const postId = idOf(c.p.postId), desired = c.p.desired;
      if (typeof desired !== 'boolean') return fail('INVALID_INPUT', '点赞状态不正确。');
      return idempotent(c, 'like', postId + ':' + desired, () => {
        const post = visiblePost(c, postId), pos = readPosition(c.p.position, c.now);
        requireGate(pos, post, c.now);
        useTicket(c, 'like', post.id, pos);
        const liked = setLike(c.doc, me(c).id, post, desired, c.now);
        return { id: post.id, liked, likes: post.likes };
      });
    },
    uploadPhoto(c) {
      if (c.p.contentType !== 'image/jpeg') return fail('PHOTO_FORMAT');
      const checked = checkPhoto(c.p.base64);
      if (!checked.ok) return fail(checked.code);
      const base64 = c.p.base64 as string;
      return idempotent(c, 'photo', base64, () => {
        const pos = readPosition(c.p.position, c.now);
        requireGate(pos, pos, c.now);
        useTicket(c, 'photo', '', pos);
        const id = 'photo-' + randomHex(24, random);
        c.doc.photos[id] = { id, accountId: me(c).id, state: 'staged', postId: null, position: { latitude: pos.latitude, longitude: pos.longitude }, createdAt: c.now, bytes: checked.bytes };
        c.photoWrites.push([id, base64]);
        return { photoId: id, expiresAt: c.now + PHOTO_TTL };
      });
    },
    async photo(c) {
      const viewer = me(c), d = c.doc, post = visiblePost(c, c.p.postId);
      if (!isParticipant(d, viewer.id, post)) requireGate(readPosition(c.p.position, c.now), post, c.now);
      if (!post.photoId) return { dataUri: null };
      const row = d.photos[post.photoId];
      if (!row || row.state !== 'attached' || row.postId !== post.id) return fail('PHOTO_MISSING');
      const bytes = await kv.getItem(PHOTO_KEY_PREFIX + row.id);
      if (!bytes) return fail('PHOTO_MISSING');
      return { dataUri: 'data:image/jpeg;base64,' + bytes };
    },
    delete(c) {
      const postId = idOf(c.p.postId);
      return idempotent(c, 'delete', postId, () => {
        const post = c.doc.posts[postId];
        if (!post || post.state !== 'active') return fail('POST_MISSING');
        if (post.ownerId !== me(c).id) fail('FORBIDDEN', '只能删除自己的留话。');
        post.state = 'deleted';
        post.deletedAt = c.now;
        if (post.photoId && c.doc.photos[post.photoId]) { c.doc.photos[post.photoId].state = 'deleted'; c.photoDeletes.push(post.photoId); }
        // Pending chat requests on a deleted post become invalid (no one can accept them and use a credit).
        for (const chat of Object.values(c.doc.chats)) {
          if (chat.postId === post.id && chat.state === 'pending') { chat.state = 'cancelled'; chat.updatedAt = c.now; }
        }
        return { id: post.id };
      });
    },
    bookmark(c) {
      const post = visiblePost(c, c.p.postId), saved = c.p.saved, key = bookmarkKey(me(c).id, post.id);
      if (typeof saved !== 'boolean') return fail('INVALID_INPUT', '收藏状态不正确。');
      if (saved) c.doc.bookmarks[key] = c.doc.bookmarks[key] ?? { accountId: me(c).id, postId: post.id, createdAt: c.now };
      else delete c.doc.bookmarks[key];
      return { postId: post.id, saved };
    },
    bookmarks(c) {
      const viewer = me(c), d = c.doc, pos = optionalPosition(c.p.position, c.now);
      const posts = Object.values(d.bookmarks).filter((b) => b.accountId === viewer.id).sort((a, b) => b.createdAt - a.createdAt)
        .map((b) => d.posts[b.postId]).filter((p): p is PostRow => !!p && p.state === 'active' && !postHidden(d, viewer.id, p))
        .map((p) => summaryFor(c, p, pos));
      return { posts };
    },
    mine(c) { return { posts: conversationPosts(c).own.map((p) => threadMeta(c, p)) }; },
    conversations(c) { return { threads: conversationPosts(c).all.map((p) => threadMeta(c, p)) }; },
    activity(c) { return { events: events(c, conversationPosts(c).all) }; },
    inbox(c) {
      const { all, own } = conversationPosts(c);
      return { threads: all.map((p) => threadMeta(c, p)), mine: own.map((p) => threadMeta(c, p)), events: events(c, all), chats: listChats(c) };
    },
    report(c) {
      const target = parseTarget(c.p.target), reason = c.p.reason as ReportReason;
      if (!REASONS.includes(reason)) return fail('INVALID_INPUT', '举报原因不正确。');
      const note = c.p.note === undefined || c.p.note === null || c.p.note === '' ? '' : validateText(c.p.note, REPORT_NOTE_MAX, '补充说明');
      return idempotent(c, 'report', JSON.stringify({ target, reason, note }), () => {
        const viewer = me(c), day = Math.floor(c.now / DAY);
        const count = viewer.rate.reportDay === day ? viewer.rate.reports : 0;
        if (count >= REPORTS_PER_DAY) fail('TOO_FAST');
        resolveTarget(c, target);
        viewer.rate = { ...viewer.rate, reportDay: day, reports: count + 1 };
        const id = newId('report', random, c.now);
        c.doc.reports[id] = { id, accountId: viewer.id, target, reason, note, createdAt: c.now };
        return { reportId: id, hidden: true };
      });
    },
    block(c) {
      const target = parseTarget(c.p.target);
      return idempotent(c, 'block', JSON.stringify(target), () => {
        const viewer = me(c), d = c.doc, { ownerId, placeName } = resolveTarget(c, target);
        if (ownerId === viewer.id) fail('FORBIDDEN', '不能屏蔽自己。');
        if (target.kind === 'post') requirePreview(c, target.postId);
        // One row (and a fresh opaque id) per block action, even when this author is already blocked: the result must not
        // reveal that two places share an author. `blocks` lists one entry per action; the author stays blocked while any remains.
        const id = newId('block', random, c.now);
        d.blocks[id] = { id, accountId: viewer.id, blockedId: ownerId, label: '在「' + placeName + '」遇到的人', createdAt: c.now };
        for (const chat of Object.values(d.chats)) {
          const pair = (chat.requesterId === viewer.id && chat.authorId === ownerId) || (chat.authorId === viewer.id && chat.requesterId === ownerId);
          if (pair && chat.state === 'pending') { chat.state = 'cancelled'; chat.updatedAt = c.now; }
        }
        return { blockId: id };
      });
    },
    blocks(c) {
      const viewer = me(c);
      return { blocks: Object.values(c.doc.blocks).filter((b) => b.accountId === viewer.id).sort((a, b) => b.createdAt - a.createdAt)
        .map((b) => ({ id: b.id, label: b.label, createdAt: b.createdAt })) };
    },
    unblock(c) {
      const id = typeof c.p.blockId === 'string' ? c.p.blockId : '', row = c.doc.blocks[id];
      if (!row || row.accountId !== me(c).id) return fail('INVALID_INPUT', '屏蔽记录不存在。');
      delete c.doc.blocks[id];
      return { blockId: id };
    },
    requestChat(c) {
      const postId = idOf(c.p.postId), greeting = validateText(c.p.greeting, GREETING_MAX, '招呼');
      return idempotent(c, 'chat', postId + ':' + greeting, () => {
        const viewer = me(c), d = c.doc, post = visiblePost(c, postId), pos = readPosition(c.p.position, c.now);
        requireGate(pos, post, c.now);
        useTicket(c, 'chat', post.id, pos);
        if (post.ownerId === viewer.id) fail('FORBIDDEN', '不能和自己私聊。');
        if (isBlockedBetween(d, viewer.id, post.ownerId)) fail('BLOCKED');
        const open = Object.values(d.chats).some((x) => x.postId === post.id && x.requesterId === viewer.id && (x.state === 'pending' || x.state === 'active'));
        if (open) fail('CHAT_STATE', '这条留话已经有一个进行中的私聊申请。');
        if (creditsOf(d, viewer.id) < 1) fail('NO_ENTITLEMENT');
        moderate(greeting);
        const id = newId('chat', random, c.now);
        const chat: ChatRow = { id, postId: post.id, placeName: post.name, requesterId: viewer.id, authorId: post.ownerId, state: 'pending',
          greeting, createdAt: c.now, updatedAt: c.now, lastMessageAt: null, messageCount: 0, simReplies: 0 };
        d.chats[id] = chat;
        afterChatRequest(d, chat, c.now, random);
        return chatMeta(c, chat);
      });
    },
    respondChat(c) {
      const chatId = idOf(c.p.chatId, 'CHAT_MISSING'), accept = c.p.accept;
      if (typeof accept !== 'boolean') return fail('INVALID_INPUT', '回应状态不正确。');
      return idempotent(c, 'respondChat', chatId + ':' + accept, () => {
        const d = c.doc, chat = myChat(c, chatId);
        if (chat.authorId !== me(c).id) fail('FORBIDDEN');
        if (chat.state !== 'pending') fail('CHAT_STATE');
        if (d.posts[chat.postId]?.state !== 'active') fail('POST_MISSING');
        if (accept) {
          if (isBlockedBetween(d, chat.requesterId, chat.authorId)) fail('BLOCKED');
          if (creditsOf(d, chat.requesterId) < 1) fail('NO_ENTITLEMENT', AUTHOR_NO_ENTITLEMENT);
          if (!isSimUser(chat.requesterId)) d.credits[chat.requesterId] = creditsOf(d, chat.requesterId) - 1;
          chat.state = 'active';
        } else chat.state = 'declined';
        chat.updatedAt = c.now;
        return chatMeta(c, chat);
      });
    },
    cancelChat(c) {
      const chatId = idOf(c.p.chatId, 'CHAT_MISSING');
      return idempotent(c, 'cancelChat', chatId, () => {
        const chat = myChat(c, chatId);
        if (chat.requesterId !== me(c).id) fail('FORBIDDEN');
        if (chat.state !== 'pending') fail('CHAT_STATE');
        chat.state = 'cancelled';
        chat.updatedAt = c.now;
        return chatMeta(c, chat);
      });
    },
    chats(c) { return { chats: listChats(c) }; },
    chat(c) {
      const viewer = me(c), chat = myChat(c, c.p.chatId);
      if (chatHidden(c, chat)) fail('CHAT_MISSING');
      const messages: ChatMessage[] = Object.values(c.doc.chatMessages)
        .filter((m) => m.chatId === chat.id && !reported(c.doc, viewer.id, (t) => t.kind === 'chat' && t.messageId === m.id))
        .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
        .map((m) => ({ id: m.id, chatId: m.chatId, text: m.text, mine: m.ownerId === viewer.id, createdAt: m.createdAt }));
      return { chat: chatMeta(c, chat), messages };
    },
    sendChat(c) {
      const chatId = idOf(c.p.chatId, 'CHAT_MISSING'), text = validateText(c.p.text, CHAT_TEXT_MAX, '消息');
      return idempotent(c, 'sendChat', chatId + ':' + text, () => {
        const viewer = me(c), d = c.doc, chat = myChat(c, chatId);
        if (isBlockedBetween(d, chat.requesterId, chat.authorId)) fail('BLOCKED');
        if (chat.state !== 'active') fail('CHAT_STATE');
        if (chat.messageCount >= CHAT_MESSAGE_CAP) fail('CHAT_STATE', '这段私聊的消息已达上限。');
        moderate(text);
        const row = addChatMessage(d, chat, viewer.id, text, c.now, newId('msg', random, c.now));
        afterMyChatMessage(d, chat, viewer.id, c.now, random);
        return { id: row.id, chatId: chat.id, text: row.text, mine: true, createdAt: row.createdAt };
      });
    },
    destroyChat(c) {
      const chatId = idOf(c.p.chatId, 'CHAT_MISSING');
      return idempotent(c, 'destroyChat', chatId, () => {
        const d = c.doc, chat = myChat(c, chatId);
        if (chat.state === 'destroyed') fail('CHAT_STATE');
        for (const [id, m] of Object.entries(d.chatMessages)) if (m.chatId === chat.id) delete d.chatMessages[id];
        d.jobs = d.jobs.filter((j) => j.chatId !== chat.id);
        chat.state = 'destroyed';
        chat.greeting = '';
        chat.messageCount = 0;
        chat.updatedAt = c.now;
        scrubChatOps(d, chat.id);
        return chatMeta(c, chat);
      });
    },
    entitlements(c) { return { chatCredits: creditsOf(c.doc, me(c).id), mock: true }; },
    demoSettings(c) { me(c); return settingsOf(c.doc); },
    demoUpdateSettings(c) {
      me(c);
      const s = c.doc.settings, p = c.p;
      if (p.latencyMs !== undefined) {
        const l = p.latencyMs;
        if (!Array.isArray(l) || l.length !== 2 || !l.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 5000) || l[0] > l[1]) {
          return fail('INVALID_INPUT', '延迟设置不正确。');
        }
        s.latencyMs = [l[0], l[1]];
      }
      if (p.flakyWrites !== undefined) { if (typeof p.flakyWrites !== 'boolean') return fail('INVALID_INPUT'); s.flakyWrites = p.flakyWrites; }
      if (p.simulatedUsers !== undefined) {
        if (typeof p.simulatedUsers !== 'boolean') return fail('INVALID_INPUT');
        s.simulatedUsers = p.simulatedUsers;
        if (!p.simulatedUsers) c.doc.jobs = [];
      }
      return settingsOf(c.doc);
    },
    demoReanchor(c) {
      const viewer = me(c), center = c.p.center;
      if (!isPoint(center)) return fail('INVALID_LOCATION');
      const point = { latitude: center.latitude, longitude: center.longitude };
      const source = c.doc.anchor?.source ?? 'fix';
      if (!hasSeeds(c.doc)) insertSeeds(c.doc, point, source, false, viewer.id, c.now);
      else reanchorSeeds(c.doc, point, source);
      return settingsOf(c.doc);
    },
    demoReset(c) {
      me(c);
      c.photoDeletes.push(...Object.keys(c.doc.photos));
      c.replaceDoc(resetContent(c.doc, c.now));
      return { reset: true };
    },
    demoGrantCredits(c) {
      const viewer = me(c);
      c.doc.credits[viewer.id] = creditsOf(c.doc, viewer.id) + 3;
      return { chatCredits: c.doc.credits[viewer.id], mock: true };
    },
    demoAccounts(c) {
      const viewer = me(c);
      return { accounts: (['wechat', 'apple', 'guest'] as AuthMethod[]).map((method) => ({ method, label: ACCOUNT_LABELS[method], current: viewer.method === method })) };
    },
    demoIntro(c) {
      const viewer = me(c);
      if (!hasSeeds(c.doc)) insertSeeds(c.doc, DEFAULT_ORIGIN, 'simulated', true, viewer.id, c.now);
      return { postId: INTRO_POST_ID };
    },
  };

  async function handleNow(action: string, payload: unknown, token: string | null): Promise<ApiEnvelope<unknown>> {
    const now = clock();
    let d: Doc;
    try { d = await ensure(now); } catch { return { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: new ApiError('SERVICE_UNAVAILABLE').message }, serverTime: now }; }
    const removed = prune(d, now);
    runDue(d, now, random);
    const checkpoint = JSON.stringify(d);
    const ctx: Ctx = {
      doc: d, now, p: isRecord(payload) ? payload : {}, token: typeof token === 'string' && token ? token : null, account: null,
      photoWrites: [], photoDeletes: [...removed], replaceDoc(next) { doc = next; ctx.doc = next; },
    };
    let envelope: ApiEnvelope<unknown>;
    try {
      if (!isApiAction(action)) fail('INVALID_ACTION');
      const typed = action as ApiAction;
      const session = ctx.token ? d.sessions[ctx.token] : undefined;
      ctx.account = session ? d.accounts[session.accountId] ?? null : null;
      if (!OPEN_ACTIONS.has(typed)) {
        if (!ctx.account) fail('AUTH_REQUIRED');
        if (!ctx.account!.member && !NON_MEMBER_ACTIONS.has(typed) && !typed.startsWith('demo')) fail('INVITE_REQUIRED');
      }
      const data = await (handlers[typed] as (c: Ctx) => unknown)(ctx);
      for (const [id, base64] of ctx.photoWrites) await kv.setItem(PHOTO_KEY_PREFIX + id, base64);
      envelope = { ok: true, data, serverTime: now };
    } catch (error) {
      // Roll back the failed action; keep what prune/simulation did before it.
      doc = JSON.parse(checkpoint) as Doc;
      ctx.photoDeletes = [...removed];
      envelope = error instanceof ApiError
        ? { ok: false, error: { code: error.code, message: error.message }, serverTime: now }
        : { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: new ApiError('SERVICE_UNAVAILABLE').message }, serverTime: now };
    }
    const current = doc as Doc, serialized = JSON.stringify(current);
    if (serialized !== persisted) {
      try {
        await save(current);
        persisted = serialized;
      } catch {
        // Nothing of this call reached storage: forget it in memory too, so a retry runs it again instead of returning a
        // receipt that was never persisted. SERVICE_UNAVAILABLE (not NETWORK) tells the client it was not committed.
        doc = JSON.parse(persisted) as Doc;
        for (const [id] of ctx.photoWrites) await kv.removeItem(PHOTO_KEY_PREFIX + id).catch(() => undefined);
        return { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: new ApiError('SERVICE_UNAVAILABLE').message }, serverTime: now };
      }
    }
    for (const id of ctx.photoDeletes) await kv.removeItem(PHOTO_KEY_PREFIX + id).catch(() => undefined);
    return envelope;
  }

  return {
    handle(action, payload, token) {
      const run = lock.then(() => handleNow(action, payload, token));
      lock = run.catch(() => undefined);
      return run;
    },
    async settings() {
      const run = lock.then(async () => settingsOf(await ensure(clock())));
      lock = run.catch(() => undefined);
      return run;
    },
    notice() {
      const value = pendingNotice;
      pendingNotice = '';
      return value;
    },
    peek() { return doc; },
  };
}

export type SimulatedTransportOptions = { random?: Random; sleep?: (ms: number) => Promise<void> };

/**
 * Transport over a mock server with simulated network: waits `rand(latencyMs)` per call, and in flaky mode
 * one in five idempotent writes commits on the server and then fails NETWORK (exercises requestId retries).
 */
export function createSimulatedTransport(server: MockServer, options: SimulatedTransportOptions = {}): Transport {
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  return async (action, payload, token) => {
    let settings: DemoSettings | null = null;
    try { settings = await server.settings(); } catch { settings = null; }
    if (settings) {
      const [low, high] = settings.latencyMs;
      const wait = Math.max(0, low + random() * Math.max(0, high - low));
      if (wait > 0) await sleep(wait);
    }
    const result = await server.handle(action, payload, token);
    if (result.ok && settings?.flakyWrites && WRITE_ACTIONS.has(action) && random() < 0.2) {
      return { ok: false, error: { code: 'NETWORK', message: new ApiError('NETWORK').message }, serverTime: result.serverTime };
    }
    return result;
  };
}
