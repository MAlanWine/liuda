// Pure helpers for user-submitted writes: one requestId per body (minted on edit), one submit in flight at a time.
import { newRequestId } from './ids.ts';

/** A body the user is composing plus the idempotency key for submitting exactly that body. */
export type Attempt = { text: string; requestId: string | null };
export const emptyAttempt: Attempt = { text: '', requestId: null };

/**
 * The user changed the body: mint its requestId now (not at tap time), so every tap and retry of this body sends the
 * same id and a double tap can never create two writes. Blank body -> no id.
 */
export function editAttempt(text: string, mint: () => string = newRequestId): Attempt {
  return { text, requestId: text.trim() ? mint() : null };
}

/** Same body, new id (after REQUEST_CONFLICT, or when an id is missing at submit time). */
export function renewAttempt(attempt: Attempt, mint: () => string = newRequestId): Attempt {
  return { text: attempt.text, requestId: mint() };
}

export type InFlight = { current: boolean };

/**
 * Runs `task` unless one is already running on `flag` (pass a `useRef(false)`). The flag is set synchronously, so a
 * second tap in the same frame — before any state update renders — is dropped. Resolves undefined when dropped.
 */
export async function exclusive<T>(flag: InFlight, task: () => Promise<T>): Promise<T | undefined> {
  if (flag.current) return undefined;
  flag.current = true;
  try { return await task(); }
  finally { flag.current = false; }
}
