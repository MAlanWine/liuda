import { createApiClient } from './client.ts';
import { createMockTransport } from './mock/asyncStorage.ts';
import type { LiudaApi } from './types.ts';

export * from './types.ts';
export { ApiError, describeError, ERROR_MESSAGES, isApiError } from './errors.ts';

// The only place that picks the transport. A real backend replaces these two lines.
const mock = createMockTransport();
let sessionToken: string | null = null;

export const api: LiudaApi = createApiClient(mock.transport, () => sessionToken);

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

/** One-shot notice from the backend layer (e.g. corrupt local demo data was backed up); '' when none. */
export function backendNotice(): string {
  return mock.notice();
}
