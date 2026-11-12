// Pure rule for the place detail's 申请私聊 entry: one open request per post per requester (server enforces the same).
import type { ChatMeta } from '../api/types.ts';

export type ChatEntry =
  | { kind: 'request' }
  | { kind: 'pending'; chatId: string; label: string }
  | { kind: 'open'; chatId: string; label: string };

/**
 * My open chat about `postId` as the requester (pending or active), if any. Declined / cancelled / destroyed chats
 * do not count: a new request is allowed again, as on the server.
 */
export function myOpenChat(chats: readonly ChatMeta[] | null | undefined, postId: string): ChatMeta | null {
  return chats?.find(c => c.postId === postId && c.role === 'requester' && (c.state === 'pending' || c.state === 'active')) ?? null;
}

/** 申请私聊 when there is no open chat; 已申请 while pending; 打开私聊 once accepted (both route to `/chat/[id]`). */
export function chatEntry(chats: readonly ChatMeta[] | null | undefined, postId: string): ChatEntry {
  const chat = myOpenChat(chats, postId);
  if (!chat) return { kind: 'request' };
  return chat.state === 'active'
    ? { kind: 'open', chatId: chat.id, label: '打开私聊' }
    : { kind: 'pending', chatId: chat.id, label: '已申请私聊 · 等待对方同意' };
}
