/**
 * Opt-in render counters used by the streaming performance test and the
 * playground ("Show render counts"). Disabled unless globalThis.__KR_PROFILE__
 * is set, so the cost in production is a single property read.
 */
declare global {
  var __KR_PROFILE__: Map<string, number> | undefined;
}

export function countRender(key: string) {
  const map = globalThis.__KR_PROFILE__;
  if (map) map.set(key, (map.get(key) ?? 0) + 1);
}

export function startProfiling(): Map<string, number> {
  globalThis.__KR_PROFILE__ = new Map();
  return globalThis.__KR_PROFILE__;
}

export function stopProfiling() {
  globalThis.__KR_PROFILE__ = undefined;
}
