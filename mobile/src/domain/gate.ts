import { ERROR_MESSAGES } from '../api/errors.ts';
import type { GeoPoint, PositionEvidence, Tier } from '../api/types.ts';
import { distanceMeters, isPoint } from './geo.ts';

export const FULL_RADIUS = 50;
export const PREVIEW_RADIUS = 200;
export const NEARBY_RADIUS = 350;
export const MAX_ACCURACY = 30;
export const MAX_AGE_MS = 15000;
export const FUTURE_SKEW_MS = 5000;
export const TICKET_TTL_MS = 30000;
export const PARTICIPANT_READ_MS = 60000;
export const OTHER_READ_MS = 12000;

export type GateCode = 'LOCATION_REQUIRED' | 'STALE_LOCATION' | 'WEAK_LOCATION' | 'NOT_ONSITE' | 'INVALID_LOCATION';
export type GateResult = { ok: true } | { ok: false; code: GateCode; message: string };

const fail = (code: GateCode): GateResult => ({ ok: false, code, message: ERROR_MESSAGES[code] });

/** Structural check of a position object (shape, WGS-84, known source). */
export function isPositionEvidence(value: unknown): value is PositionEvidence {
  if (!isPoint(value)) return false;
  const p = value as PositionEvidence;
  return p.crs === 'wgs84' && (p.source === 'gps' || p.source === 'simulated')
    && typeof p.timestamp === 'number' && Number.isFinite(p.timestamp)
    && (p.accuracy === null || typeof p.accuracy === 'number');
}

/** Usable at all (no distance): valid, and for GPS fresh with a finite accuracy ≤30 m. */
export function checkPosition(pos: PositionEvidence | null | undefined, now: number): GateResult {
  if (!pos) return fail('LOCATION_REQUIRED');
  if (!isPositionEvidence(pos)) return fail('INVALID_LOCATION');
  if (pos.source === 'simulated') return { ok: true };
  if (pos.timestamp > now + FUTURE_SKEW_MS || now - pos.timestamp > MAX_AGE_MS) return fail('STALE_LOCATION');
  if (pos.accuracy === null || !Number.isFinite(pos.accuracy) || pos.accuracy <= 0 || pos.accuracy > MAX_ACCURACY) return fail('WEAK_LOCATION');
  return { ok: true };
}

/**
 * On-site gate. GPS: age ≤15 s, accuracy finite & ≤30 m, distance + accuracy ≤50 m.
 * Simulated: age/accuracy skipped, distance ≤50 m.
 */
export function gate(pos: PositionEvidence | null | undefined, target: GeoPoint, now: number): GateResult {
  const usable = checkPosition(pos, now);
  if (!usable.ok) return usable;
  const p = pos as PositionEvidence;
  const d = distanceMeters(p, target);
  const reach = p.source === 'simulated' ? d : d + (p.accuracy as number);
  return reach <= FULL_RADIUS ? { ok: true } : fail('NOT_ONSITE');
}

/** participated -> full; on site -> full; ≤200 m -> preview; else dot (also without a position). */
export function level(pos: PositionEvidence | null | undefined, target: GeoPoint, now: number, participated: boolean): Tier {
  if (participated) return 'full';
  if (!pos || !isPositionEvidence(pos)) return 'dot';
  if (gate(pos, target, now).ok) return 'full';
  return distanceMeters(pos, target) <= PREVIEW_RADIUS ? 'preview' : 'dot';
}

/** Age check used for the client's `fresh` flag: simulated is always fresh. */
export function isFresh(pos: PositionEvidence | null | undefined, now: number): boolean {
  if (!pos) return false;
  if (pos.source === 'simulated') return true;
  return pos.timestamp <= now + FUTURE_SKEW_MS && now - pos.timestamp <= MAX_AGE_MS;
}
