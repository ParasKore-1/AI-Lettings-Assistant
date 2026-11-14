/**
 * Auto-scroll model:
 *
 * - "pinned" means we keep the newest content in view.
 * - Reaching the bottom (within NEAR_BOTTOM_PX) always re-pins.
 * - Only a *user-initiated* scroll away from the bottom unpins. Scroll events
 *   caused by layout (content growing, virtual rows being measured, our own
 *   scrollTo calls) never unpin — that is what makes naive "is at bottom?"
 *   checks flaky while text streams in.
 */
export const NEAR_BOTTOM_PX = 80;
/** A scroll event within this window after wheel/touch/key input counts as the user's. */
export const USER_INTENT_WINDOW_MS = 600;

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function distanceFromBottom(m: ScrollMetrics): number {
  return Math.max(0, m.scrollHeight - m.clientHeight - m.scrollTop);
}

export function nextPinned(state: { pinned: boolean; distance: number; userInitiated: boolean }): boolean {
  if (state.distance <= NEAR_BOTTOM_PX) return true;
  if (state.userInitiated) return false;
  return state.pinned;
}

/** Keys that scroll a focused scroll container upwards / arbitrarily. */
export const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
