import { ApiError, isApiErrorCode } from './errors.ts';
import type { ApiAction, ApiEnvelope, LiudaApi, Transport } from './types.ts';

// Record keeps the list exhaustive: adding an action to ApiActions without listing it here fails tsc.
const ACTION_SET: Record<ApiAction, true> = {
  signIn: true, signOut: true, status: true, join: true, me: true, updateProfile: true,
  nearby: true, thread: true, presence: true, post: true, comment: true, continueComment: true,
  like: true, uploadPhoto: true, photo: true, delete: true, bookmark: true, bookmarks: true,
  mine: true, conversations: true, activity: true, inbox: true, report: true, block: true,
  blocks: true, unblock: true, requestChat: true, respondChat: true, cancelChat: true, chats: true,
  chat: true, sendChat: true, destroyChat: true, entitlements: true, demoSettings: true,
  demoUpdateSettings: true, demoReanchor: true, demoReset: true, demoGrantCredits: true,
  demoAccounts: true, demoIntro: true,
};
export const API_ACTIONS = Object.keys(ACTION_SET) as ApiAction[];

export function isApiAction(value: unknown): value is ApiAction {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ACTION_SET, value);
}

/** Unwraps the `{ ok, data | error }` envelope; every failure surfaces as `ApiError`. */
export function unwrap<T>(envelope: ApiEnvelope<unknown> | null | undefined): T {
  if (!envelope || typeof envelope !== 'object') throw new ApiError('SERVICE_UNAVAILABLE');
  if (envelope.ok) return envelope.data as T;
  const code = envelope.error && isApiErrorCode(envelope.error.code) ? envelope.error.code : 'SERVICE_UNAVAILABLE';
  throw new ApiError(code, envelope.error?.message);
}

export function createApiClient(transport: Transport, getToken: () => string | null): LiudaApi {
  const api = {} as Record<ApiAction, (req: unknown) => Promise<unknown>>;
  for (const action of API_ACTIONS) {
    api[action] = async (req: unknown) => {
      let envelope: ApiEnvelope<unknown>;
      try {
        envelope = await transport(action, req ?? {}, getToken());
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('NETWORK');
      }
      return unwrap(envelope);
    };
  }
  return api as unknown as LiudaApi;
}
