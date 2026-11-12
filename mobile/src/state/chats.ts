import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, ApiError, isApiError, type ChatMessage, type ChatMeta } from '../api';
import { newRequestId } from '../domain/ids';
import { retryOnNetwork, sendChat } from './actions';
import { useBus } from './bus';
import { useInboxSeen } from './inbox';
import { useSession } from './session';

const POLL_MS = 5_000;
const toApiError = (error: unknown) => isApiError(error) ? error as ApiError : new ApiError('SERVICE_UNAVAILABLE');

/**
 * One private chat: `{ chat, messages, loading, error, refresh, send(text) }`. Polls every 5 s while the screen is
 * focused and the app active; marks this chat seen for the 消息 badge. `send` throws `ApiError` (text kept by caller).
 */
export function useChat(chatId: string): {
  chat: ChatMeta | null; messages: ChatMessage[]; loading: boolean; error: ApiError | null;
  refresh(): Promise<void>; send(text: string, requestId?: string): Promise<void>;
} {
  const { session } = useSession();
  const token = session?.token ?? null;
  const markChatSeen = useInboxSeen();
  const [chat, setChat] = useState<ChatMeta | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const latest = useRef({ chatId, token, markChatSeen });
  useEffect(() => { latest.current = { chatId, token, markChatSeen }; });
  const seq = useRef(0);
  const pending = useRef<{ text: string; requestId: string } | null>(null);

  const refresh = useCallback(async () => {
    const { chatId: id, token: t } = latest.current;
    if (!t || !id) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const res = await retryOnNetwork(() => api.chat({ chatId: id }));
      if (n !== seq.current) return;
      setChat(res.chat);
      setMessages(res.messages);
      setError(null);
      latest.current.markChatSeen(id, Math.max(res.chat.updatedAt, res.chat.lastMessageAt ?? 0));
    } catch (e) {
      if (n === seq.current) setError(toApiError(e));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);

  const key = `${token ?? ''}|${chatId}`;
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) { setShownKey(key); setChat(null); setMessages([]); setError(null); }
  useBus(['chats', 'session'], () => { refresh(); });
  useFocusEffect(useCallback(() => {
    refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]));

  const send = useCallback(async (text: string, requestId?: string) => {
    // The caller's id (minted when the text changed) wins; otherwise reuse the id when the same text is retried.
    const reuse = pending.current && pending.current.text === text ? pending.current : null;
    const attempt = requestId ? { text, requestId } : reuse ?? { text, requestId: newRequestId() };
    pending.current = attempt;
    await sendChat(latest.current.chatId, text, attempt.requestId);
    pending.current = null;
    await refresh();
  }, [refresh]);

  return { chat, messages, loading, error, refresh, send };
}
