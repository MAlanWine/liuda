import { useEffect, useRef } from 'react';

/** Invalidation topics. Stores refetch when a topic they read is emitted. */
export type BusTopic = 'posts' | `thread:${string}` | 'inbox' | 'chats' | 'session' | 'demo';
type Listener = (topic: BusTopic) => void;

const listeners = new Map<BusTopic, Set<Listener>>();

/** Announces that data behind `topic` changed (after a successful write, sign-in switch, demo reset…). */
export function emit(...topics: BusTopic[]): void {
  for (const topic of new Set(topics)) {
    for (const fn of [...(listeners.get(topic) ?? [])]) {
      try { fn(topic); } catch { /* a broken listener must not stop the others */ }
    }
  }
}

/** Subscribes to a topic; returns the unsubscribe function. */
export function on(topic: BusTopic, fn: Listener): () => void {
  let set = listeners.get(topic);
  if (!set) listeners.set(topic, set = new Set());
  set.add(fn);
  return () => {
    set.delete(fn);
    if (!set.size) listeners.delete(topic);
  };
}

/** Hook form of `on` for several topics; `fn` may change between renders without resubscribing. */
export function useBus(topics: readonly BusTopic[], fn: Listener): void {
  const latest = useRef(fn);
  useEffect(() => { latest.current = fn; });
  const key = topics.join('|');
  useEffect(() => {
    const offs = key.split('|').filter(Boolean).map(topic => on(topic as BusTopic, t => latest.current(t)));
    return () => { for (const off of offs) off(); };
  }, [key]);
}
