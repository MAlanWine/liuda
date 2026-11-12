import type { ApiErrorCode } from './types.ts';

export const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  AUTH_REQUIRED: '请先登录（演示账号）。',
  INVITE_REQUIRED: '请先加入试用。',
  INVITE_INVALID: '邀请码不正确。',
  FORBIDDEN: '没有权限进行这项操作。',
  INVALID_ACTION: '暂不支持这项操作。',
  INVALID_INPUT: '内容长度不正确。',
  INVALID_LOCATION: '请使用手机真实定位。',
  LOCATION_REQUIRED: '首次查看或加入这条对话需要定位；到场参与后可离场继续。',
  STALE_LOCATION: '位置已过期，请重新定位。',
  WEAK_LOCATION: '定位较弱，请到室外开阔处重试。',
  NOT_ONSITE: '请再靠近一些，确认到场后才能操作。',
  PRESENCE_EXPIRED: '到场凭证已失效，请重新操作。',
  REQUEST_CONFLICT: '请求内容已经改变，请重新提交。',
  TOO_FAST: '操作太频繁，稍后再试。',
  POST_MISSING: '这条留话已不可用。',
  POST_LIMIT: '本轮试用最多保留 50 条自己的留话。',
  THREAD_FULL: '本轮试用每条留话最多 100 条回复。',
  PARTICIPATION_REQUIRED: '请先到场参与这条对话，之后可离场继续。',
  CONTENT_REJECTED: '内容暂时无法发布，请调整文字。（演示审核）',
  PHOTO_SIZE: '图片应小于 512KB，请重新拍摄。',
  PHOTO_FORMAT: '只支持现场拍摄的 JPEG 图片。',
  PHOTO_EXPIRED: '图片已失效，请重新拍摄。',
  PHOTO_MISSING: '图片暂不可用。',
  BLOCKED: '你已屏蔽对方，或对方暂不接收。',
  CHAT_MISSING: '这段私聊已不存在。',
  CHAT_STATE: '私聊状态已变化，请刷新。',
  NO_ENTITLEMENT: '演示权益已用完，可在「演示与模拟」中领取。',
  NETWORK: '网络不稳定（模拟），请重试。',
  SERVICE_UNAVAILABLE: '服务暂不可用，请稍后重试。',
};

const CODES = new Set(Object.keys(ERROR_MESSAGES));

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && CODES.has(value);
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode, message?: string) {
    super(message || ERROR_MESSAGES[code]);
    this.name = 'ApiError';
    this.code = code;
  }
}

/** INVALID_INPUT message for a named field, e.g. `留话` -> `留话长度不正确。`. */
export function inputError(field: string): ApiError {
  return new ApiError('INVALID_INPUT', field + '长度不正确。');
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
    || (!!value && typeof value === 'object' && isApiErrorCode((value as { code?: unknown }).code)
      && typeof (value as { message?: unknown }).message === 'string');
}

/** Chinese, user-facing text for anything thrown by the API layer (or elsewhere). */
export function describeError(error: unknown): string {
  if (isApiError(error)) return error.message || ERROR_MESSAGES[error.code];
  return ERROR_MESSAGES.SERVICE_UNAVAILABLE;
}
