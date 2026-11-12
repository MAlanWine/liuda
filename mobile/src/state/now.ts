import { useEffect, useState } from 'react';

/** Current time in ms, re-rendering every `intervalMs` (relative times, heat, chat gaps). Default 30 s. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
