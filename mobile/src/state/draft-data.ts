// Pure encode/decode of the 留下 draft for AsyncStorage (`liuda-draft-v1`), one entry per account (`Session.accountKey`).
import { CLUE_MAX, NAME_MAX, TEXT_MAX } from '../domain/text.ts';

/** Compose draft. `requestId` is kept across failed attempts so a retry stays idempotent (D-18). */
export type Draft = {
  text: string; name: string; clue: string; sceneId: string | null;
  photo: { uri: string; base64: string; simulated: boolean } | null; requestId: string | null;
};
export const emptyDraft: Draft = { text: '', name: '', clue: '', sceneId: null, photo: null, requestId: null };

export const DRAFT_KEY = 'liuda-draft-v1';
/** How long typing pauses before the draft is written. */
export const DRAFT_SAVE_DELAY_MS = 600;

/**
 * Stored shape: the photo keeps only its local file uri (never the base64 bytes, up to 512 KB); after a restart the
 * leave screen re-encodes it from the file, or drops it if the file is gone.
 */
export type StoredDraft = {
  text: string; name: string; clue: string; sceneId: string | null;
  photo: { uri: string; simulated: boolean } | null; requestId: string | null;
};
type DraftDoc = Record<string, StoredDraft>;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const clip = (v: unknown, max: number) => typeof v === 'string' ? Array.from(v).slice(0, max).join('') : '';
const optionalId = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 120 ? v : null;

/** Nothing worth keeping (a requestId alone is not content). */
export function isEmptyDraft(draft: Draft | StoredDraft): boolean {
  return !draft.text && !draft.name && !draft.clue && !draft.sceneId && !draft.photo;
}

export function encodeDraft(draft: Draft): StoredDraft {
  return {
    text: draft.text, name: draft.name, clue: draft.clue, sceneId: draft.sceneId, requestId: draft.requestId,
    photo: draft.photo ? { uri: draft.photo.uri, simulated: draft.photo.simulated } : null,
  };
}

/** Validates a stored entry; anything unusable becomes the empty draft. A restored photo has `base64: ''` until re-encoded. */
export function decodeDraft(value: unknown): Draft {
  if (!isRecord(value)) return emptyDraft;
  const photo = isRecord(value.photo) && typeof value.photo.uri === 'string' && /^(file|data|https?):/.test(value.photo.uri)
    ? { uri: value.photo.uri, base64: '', simulated: value.photo.simulated === true }
    : null;
  return {
    text: clip(value.text, TEXT_MAX), name: clip(value.name, NAME_MAX), clue: clip(value.clue, CLUE_MAX),
    sceneId: optionalId(value.sceneId), photo, requestId: optionalId(value.requestId),
  };
}

function parseDoc(raw: string | null): DraftDoc {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed as DraftDoc : {};
  } catch {
    return {};
  }
}

/** The account's draft from the stored doc (empty when missing or broken). */
export function readDraft(raw: string | null, account: string): Draft {
  return account ? decodeDraft(parseDoc(raw)[account]) : emptyDraft;
}

/** The stored doc with this account's entry replaced, or removed when the draft is empty. Other accounts are kept. */
export function writeDraft(raw: string | null, account: string, draft: Draft): string {
  const doc = parseDoc(raw);
  if (isEmptyDraft(draft)) delete doc[account];
  else doc[account] = encodeDraft(draft);
  return JSON.stringify(doc);
}
