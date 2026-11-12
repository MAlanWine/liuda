import { heat, type HeatInput } from './heat.ts';

export type FeedSort = 'recommended' | 'latest';
export type Rankable = HeatInput & { id: string };

const byId = (a: Rankable, b: Rankable) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * latest: newest first. recommended: heat desc, but slot #1 and every 4th slot (indices 0, 4, 8 …)
 * go to the newest still-unused fresh ordinary (tier 1, < 24 h) post when one exists.
 */
export function rank<T extends Rankable>(posts: readonly T[], sort: FeedSort, now: number): T[] {
  if (sort === 'latest') return posts.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || byId(a, b));
  const scored = new Map(posts.map((p) => [p.id, heat(p, now)]));
  const ordered = posts.slice().sort((a, b) =>
    (scored.get(b.id)!.score - scored.get(a.id)!.score) || (b.createdAt || 0) - (a.createdAt || 0) || byId(a, b));
  const fresh = ordered.filter((p) => scored.get(p.id)!.fresh && scored.get(p.id)!.tier === 1)
    .sort((a, b) => b.createdAt - a.createdAt || byId(a, b));
  const used = new Set<string>();
  const result: T[] = [];
  while (result.length < ordered.length) {
    const candidate = result.length % 4 === 0 ? fresh.find((p) => !used.has(p.id)) : undefined;
    const next = candidate ?? ordered.find((p) => !used.has(p.id));
    if (!next) break;
    used.add(next.id);
    result.push(next);
  }
  return result;
}
