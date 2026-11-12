// Simulated other people (演示). Jobs live in the doc and run lazily via `runDue(now)` at the start of each call —
// no timers inside the server. Simulated users never destroy chats.
import { newId, type Random } from '../../domain/ids.ts';
import { addChatMessage, addComment, creditsOf, grantThread, isBlockedBetween, setLike, type ChatRow, type Doc, type JobRow, type PostRow } from './db.ts';
import { isSimUser, SIM_AUTHOR_REPLIES, SIM_CHAT_GREETINGS, SIM_CHAT_REPLIES, SIM_REPLIES, SIM_USERS } from './seed.ts';

const S = 1000, MIN = 60 * S, DAY = 24 * 60 * MIN;
export const SIM_AUTHOR_REPLIES_PER_DAY = 3;
export const SIM_CHAT_REPLIES_MAX = 20;

const pick = <T>(list: readonly T[], random: Random): T => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

export function schedule(doc: Doc, job: Omit<JobRow, 'id'>, random: Random): JobRow {
  const row: JobRow = { ...job, id: newId('job', random, job.due) };
  doc.jobs.push(row);
  return row;
}

function simActors(exclude: string, count: number, random: Random): string[] {
  const pool = SIM_USERS.map((u) => u.id as string).filter((id) => id !== exclude);
  const out: string[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return out;
}

/** After my post: +20 s reply, +45 s like, +3 min second replier, +2 min chat request to me (once per account). */
export function afterMyPost(doc: Doc, post: PostRow, accountId: string, now: number, random: Random): void {
  if (!doc.settings.simulatedUsers) return;
  const [a, b, c] = simActors(accountId, 3, random);
  schedule(doc, { due: now + 20 * S, kind: 'simReply', postId: post.id, actorId: a }, random);
  schedule(doc, { due: now + 45 * S, kind: 'simLike', postId: post.id, actorId: b }, random);
  schedule(doc, { due: now + 3 * MIN, kind: 'simReply', postId: post.id, actorId: c }, random);
  const account = doc.accounts[accountId];
  if (account && !account.simChatRequested) {
    account.simChatRequested = true;
    schedule(doc, { due: now + 2 * MIN, kind: 'simChatRequest', postId: post.id, actorId: b, accountId }, random);
  }
}

/** After my reply on a simulated author's post: +30 s author reply (≤3 per thread per day). */
export function afterMyReply(doc: Doc, post: PostRow, now: number, random: Random): void {
  if (!doc.settings.simulatedUsers || !isSimUser(post.ownerId)) return;
  const key = 'authorReply:' + post.id + ':' + Math.floor(now / DAY);
  const used = doc.simCounters[key] ?? 0;
  if (used >= SIM_AUTHOR_REPLIES_PER_DAY) return;
  doc.simCounters[key] = used + 1;
  schedule(doc, { due: now + 30 * S, kind: 'simAuthorReply', postId: post.id, actorId: post.ownerId }, random);
}

/** requestChat to a simulated author: +8 s accept, +12 s greeting. */
export function afterChatRequest(doc: Doc, chat: ChatRow, now: number, random: Random): void {
  if (!doc.settings.simulatedUsers || !isSimUser(chat.authorId)) return;
  schedule(doc, { due: now + 8 * S, kind: 'simAccept', chatId: chat.id }, random);
  schedule(doc, { due: now + 12 * S, kind: 'simChatMessage', chatId: chat.id, actorId: chat.authorId, text: pick(SIM_CHAT_GREETINGS, random) }, random);
}

/** My chat message to a simulated peer: +10 s canned reply (≤20 per chat). */
export function afterMyChatMessage(doc: Doc, chat: ChatRow, senderId: string, now: number, random: Random): void {
  const peer = chat.requesterId === senderId ? chat.authorId : chat.requesterId;
  if (!doc.settings.simulatedUsers || !isSimUser(peer) || chat.simReplies >= SIM_CHAT_REPLIES_MAX) return;
  chat.simReplies += 1;
  schedule(doc, { due: now + 10 * S, kind: 'simChatMessage', chatId: chat.id, actorId: peer, text: pick(SIM_CHAT_REPLIES, random) }, random);
}

const activePost = (doc: Doc, id: string | undefined) => {
  const post = id ? doc.posts[id] : undefined;
  return post && post.state === 'active' ? post : null;
};

/**
 * Rows are stamped with the job's due time (keeps their order), but a chat's `updatedAt` is the time the job actually
 * ran (`now`): jobs run lazily on the next call, and a request / accept / message stamped in the past could fall behind
 * the client's 消息 seen mark (taken from the wall clock) and never raise the badge.
 */
function run(doc: Doc, job: JobRow, random: Random, now: number): void {
  const at = job.due;
  const ranAt = Math.max(at, now);
  if (job.kind === 'simReply' || job.kind === 'simAuthorReply') {
    const post = activePost(doc, job.postId);
    if (!post || !job.actorId || isBlockedBetween(doc, post.ownerId, job.actorId)) return;
    const text = pick(job.kind === 'simAuthorReply' ? SIM_AUTHOR_REPLIES : SIM_REPLIES, random);
    try { addComment(doc, post, job.actorId, text, 'onsite', at, newId('cmt', random, at)); } catch { return; }
    grantThread(doc, job.actorId, post.id, 'comment', at);
  } else if (job.kind === 'simLike') {
    const post = activePost(doc, job.postId);
    if (post && job.actorId) setLike(doc, job.actorId, post, true, at);
  } else if (job.kind === 'simChatRequest') {
    const post = activePost(doc, job.postId);
    if (!post || !job.actorId || !job.accountId || isBlockedBetween(doc, job.accountId, job.actorId)) return;
    const open = Object.values(doc.chats).some((c) => c.postId === post.id && c.requesterId === job.actorId && (c.state === 'pending' || c.state === 'active'));
    if (open) return;
    const id = newId('chat', random, at);
    doc.chats[id] = { id, postId: post.id, placeName: post.name, requesterId: job.actorId, authorId: post.ownerId, state: 'pending',
      greeting: pick(SIM_CHAT_GREETINGS, random), createdAt: at, updatedAt: ranAt, lastMessageAt: null, messageCount: 0, simReplies: 0 };
  } else if (job.kind === 'simAccept') {
    const chat = job.chatId ? doc.chats[job.chatId] : undefined;
    if (!chat || chat.state !== 'pending' || !activePost(doc, chat.postId) || creditsOf(doc, chat.requesterId) < 1) return;
    if (!isSimUser(chat.requesterId)) doc.credits[chat.requesterId] = creditsOf(doc, chat.requesterId) - 1;
    chat.state = 'active';
    chat.updatedAt = ranAt;
  } else if (job.kind === 'simChatMessage') {
    const chat = job.chatId ? doc.chats[job.chatId] : undefined;
    if (!chat || chat.state !== 'active' || !job.actorId || !job.text || isBlockedBetween(doc, chat.requesterId, chat.authorId)) return;
    addChatMessage(doc, chat, job.actorId, job.text, at, newId('msg', random, at));
    chat.updatedAt = Math.max(chat.updatedAt, ranAt);
  }
}

/** Executes every job due at or before `now`, oldest first, stamped with its own due time. Returns how many ran. */
export function runDue(doc: Doc, now: number, random: Random = Math.random): number {
  const due = doc.jobs.filter((j) => j.due <= now).sort((a, b) => a.due - b.due);
  if (!due.length) return 0;
  doc.jobs = doc.jobs.filter((j) => j.due > now);
  if (!doc.settings.simulatedUsers) return 0;
  for (const job of due) run(doc, job, random, now);
  return due.length;
}
