export const DAY_MS = 86_400_000;
export const HEAT_HALF_LIFE_DAYS = 7;
export const HEAT_TIER_2 = 5;
export const HEAT_TIER_3 = 20;
export const HEAT_LABELS = ['普通', '有回应', '热门'] as const;

export type HeatTier = 1 | 2 | 3;
export type HeatLabel = (typeof HEAT_LABELS)[number];
export type Heat = { score: number; tier: HeatTier; label: HeatLabel; fresh: boolean };
export type HeatInput = { likes: number; replyParticipantCount: number; lastEngagedAt: number; createdAt: number };

const count = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);

/** `(likes + 3 × distinct repliers) × 0.5^(days since last engagement / 7)`; fresh = created < 24 h ago. */
export function heat(post: HeatInput, now: number): Heat {
  const activity = post.lastEngagedAt > 0 ? post.lastEngagedAt : post.createdAt;
  const age = activity > 0 ? Math.max(0, now - activity) : 0;
  const score = (count(post.likes) + 3 * count(post.replyParticipantCount)) * Math.pow(0.5, age / (HEAT_HALF_LIFE_DAYS * DAY_MS));
  const tier: HeatTier = score >= HEAT_TIER_3 ? 3 : score >= HEAT_TIER_2 ? 2 : 1;
  const fresh = post.createdAt > 0 && now - post.createdAt >= 0 && now - post.createdAt < DAY_MS;
  return { score, tier, label: HEAT_LABELS[tier - 1], fresh };
}
