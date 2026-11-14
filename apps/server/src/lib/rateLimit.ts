/** Fixed-window-free sliding log limiter; plenty for a single-instance demo server. */
export function createRateLimiter(limitPerMinute: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  const WINDOW = 60_000;
  return {
    /** Returns 0 when allowed, otherwise milliseconds until the next slot frees up. */
    take(key: string): number {
      const t = now();
      const list = (hits.get(key) ?? []).filter((x) => t - x < WINDOW);
      if (list.length >= limitPerMinute) {
        hits.set(key, list);
        return WINDOW - (t - list[0]!);
      }
      list.push(t);
      hits.set(key, list);
      if (hits.size > 10_000) hits.clear(); // crude memory bound
      return 0;
    },
  };
}
