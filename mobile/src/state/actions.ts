import {
  api, ApiError, isApiError,
  type ChatMessage, type ChatMeta, type CommentReceipt, type PositionEvidence, type PostSummary,
  type PresencePurpose, type ReportReason, type ReportTarget,
} from '../api';
import { gate } from '../domain/gate';
import { newRequestId } from '../domain/ids';
import { emit, type BusTopic } from './bus';
import { stampPosition } from './position';

/**
 * Write helpers (§2.2). Each does presence (when needed) + write, retries once on `NETWORK` with the same
 * requestId and payload (idempotent on the server), then emits bus topics. All throw `ApiError`.
 */

/** Runs `fn`; on a `NETWORK` error runs it once more. */
export async function retryOnNetwork<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (error) {
    if (isApiError(error) && error.code === 'NETWORK') return fn();
    throw error;
  }
}

async function ticketFor(purpose: PresencePurpose, position: PositionEvidence, postId?: string) {
  const res = await retryOnNetwork(() => api.presence({ purpose, position, ...postId ? { postId } : {} }));
  return res.ticket;
}

const postTopics = (postId: string): BusTopic[] => ['posts', `thread:${postId}`, 'inbox'];

export type PublishStep = 'presence' | 'photo' | 'post';

/**
 * Publishes a post on site: optional photo upload (presence `photo`) then presence `post` + `post`. Keep `requestId` across retries.
 * `onStep` reports progress: `presence` (first presence check), `photo` (upload, only with a photo), `post` (presence `post` + write).
 * `refix` (pass `usePosition().freshFix`) is asked again right before presence `post`, so a slow photo step never makes
 * the post go out with a fix that has gone stale meanwhile; it waits (bounded) for a fresh one, else STALE_LOCATION.
 */
export async function publishPost(
  i: { text: string; name: string; clue?: string; sceneId?: string; photoBase64?: string },
  pos: PositionEvidence, requestId: string, onStep?: (step: PublishStep) => void,
  refix?: () => Promise<PositionEvidence | null>,
): Promise<{ id: string; createdAt: number }> {
  const position = stampPosition(pos);
  onStep?.('presence');
  let photoId: string | undefined;
  if (i.photoBase64) {
    const ticket = await ticketFor('photo', position);
    onStep?.('photo');
    const base64 = i.photoBase64;
    photoId = (await retryOnNetwork(() => api.uploadPhoto({ requestId, ticket, position, base64, contentType: 'image/jpeg' }))).photoId;
  }
  onStep?.('post');
  const next = refix ? await refix() : position;
  if (!next) throw new ApiError('STALE_LOCATION');
  const postPosition = stampPosition(next);
  const ticket = await ticketFor('post', postPosition);
  const req = {
    requestId, ticket, position: postPosition, text: i.text, name: i.name,
    ...i.clue ? { clue: i.clue } : {}, ...i.sceneId ? { sceneId: i.sceneId } : {}, ...photoId ? { photoId } : {},
  };
  const res = await retryOnNetwork(() => api.post(req));
  emit(...postTopics(res.id));
  return res;
}

/**
 * Replies: on site (client gate passes) -> presence `comment` + `comment`; otherwise, if already a participant,
 * `continueComment` (no position). Throws the gate's `ApiError` when neither applies.
 */
export async function replyTo(post: PostSummary, text: string, pos: PositionEvidence | null, requestId: string): Promise<CommentReceipt> {
  const position = pos ? stampPosition(pos) : null;
  const check = gate(position, post, Date.now());
  const continueReply = () => retryOnNetwork(() => api.continueComment({ requestId, postId: post.id, text }));
  let receipt: CommentReceipt;
  if (check.ok && position) {
    try {
      const ticket = await ticketFor('comment', position, post.id);
      receipt = await retryOnNetwork(() => api.comment({ requestId, ticket, position, postId: post.id, text }));
    } catch (error) {
      const offsite = isApiError(error) && ['NOT_ONSITE', 'STALE_LOCATION', 'WEAK_LOCATION', 'PRESENCE_EXPIRED'].includes(error.code);
      if (!offsite || !post.participated) throw error;
      receipt = await continueReply();
    }
  } else if (post.participated) {
    receipt = await continueReply();
  } else {
    throw new ApiError(check.ok ? 'LOCATION_REQUIRED' : check.code);
  }
  emit(...postTopics(post.id));
  return receipt;
}

/** Sets the like state on site (presence `like`). */
export async function setLike(post: PostSummary, desired: boolean, pos: PositionEvidence): Promise<{ liked: boolean; likes: number }> {
  const position = stampPosition(pos);
  const requestId = newRequestId();
  const ticket = await ticketFor('like', position, post.id);
  const res = await retryOnNetwork(() => api.like({ requestId, ticket, position, postId: post.id, desired }));
  emit('posts', `thread:${post.id}`);
  return { liked: res.liked, likes: res.likes };
}

/** Deletes one of my posts (logical delete, no position). */
export async function deletePost(postId: string): Promise<void> {
  const requestId = newRequestId();
  await retryOnNetwork(() => api.delete({ requestId, postId }));
  emit(...postTopics(postId), 'chats');
}

function targetTopics(target: ReportTarget): BusTopic[] {
  return target.kind === 'chat' ? ['chats', 'inbox'] : ['posts', `thread:${target.postId}`, 'inbox'];
}

/** Reports a post / comment / chat; the target is hidden for me at once (`hidden: true`). */
export async function report(target: ReportTarget, reason: ReportReason, note?: string): Promise<{ hidden: boolean }> {
  const requestId = newRequestId();
  const trimmed = note?.trim();
  const res = await retryOnNetwork(() => api.report({ requestId, target, reason, ...trimmed ? { note: trimmed } : {} }));
  emit(...targetTopics(target));
  return { hidden: res.hidden };
}

/**
 * Blocks the author behind a target (resolved server-side; no user ids on the client). A post can be blocked only from
 * its preview tier up, so pass the current fix (participants are served without one).
 */
export async function block(target: ReportTarget, pos?: PositionEvidence | null): Promise<void> {
  const requestId = newRequestId();
  const position = pos ? stampPosition(pos) : null;
  await retryOnNetwork(() => api.block({ requestId, target, ...position ? { position } : {} }));
  emit(...targetTopics(target), 'posts', 'chats', 'inbox');
}

/** Removes a block from 已屏蔽. */
export async function unblock(blockId: string): Promise<void> {
  await retryOnNetwork(() => api.unblock({ blockId }));
  emit('posts', 'inbox', 'chats');
}

/**
 * Asks the post's author for a private chat (on site, presence `chat`). Uses one 演示权益 credit on accept.
 * Pass the same `requestId` when the user retries the same greeting (idempotent); a new greeting needs a new id.
 */
export async function requestChat(post: PostSummary, greeting: string, pos: PositionEvidence, requestId: string = newRequestId()): Promise<ChatMeta> {
  const position = stampPosition(pos);
  const ticket = await ticketFor('chat', position, post.id);
  const chat = await retryOnNetwork(() => api.requestChat({ requestId, ticket, position, postId: post.id, greeting }));
  emit('chats', 'inbox');
  return chat;
}

/** Author accepts or declines a pending chat request. */
export async function respondChat(chatId: string, accept: boolean): Promise<ChatMeta> {
  const requestId = newRequestId();
  const chat = await retryOnNetwork(() => api.respondChat({ requestId, chatId, accept }));
  emit('chats', 'inbox');
  return chat;
}

/** Requester withdraws a pending request. */
export async function cancelChat(chatId: string): Promise<ChatMeta> {
  const requestId = newRequestId();
  const chat = await retryOnNetwork(() => api.cancelChat({ requestId, chatId }));
  emit('chats', 'inbox');
  return chat;
}

/** Sends a chat message; pass the same `requestId` when the user retries a failed send. */
export async function sendChat(chatId: string, text: string, requestId: string): Promise<ChatMessage> {
  const message = await retryOnNetwork(() => api.sendChat({ requestId, chatId, text }));
  emit('chats', 'inbox');
  return message;
}

/** Ends a chat for both sides; messages are deleted (terminal). */
export async function destroyChat(chatId: string): Promise<ChatMeta> {
  const requestId = newRequestId();
  const chat = await retryOnNetwork(() => api.destroyChat({ requestId, chatId }));
  emit('chats', 'inbox');
  return chat;
}
